// ter-notify — 「약사로 터」 리포트 신청이 들어오면 운영 메일로 알린다.
//
// 흐름:  landing /ter 폼 → ter_requests INSERT → (트리거 055) pg_net → 이 함수 → Zoho SMTP
//
// 인증에 관하여:
//   verify_jwt=true 라서 anon 키가 필요한데, anon 키는 랜딩 HTML 에 그대로 박혀 있는 공개 키다.
//   즉 "호출할 수 있는 사람"으로는 위조를 막지 못한다. 그래서 본문의 id 를 믿지 않고
//   service_role 로 **실제 행을 다시 읽어** 존재하고 충분히 최근일 때만 메일을 보낸다.
//   위조하려면 진짜 행을 넣어야 하는데, 그건 공개 폼으로도 가능한 일이라 노출이 늘지 않는다.
//
// 필요한 시크릿(대시보드 → Edge Functions → Secrets):
//   ZOHO_USER          예: admin@yaksaro.co.kr  (SMTP 로그인 계정 = 발신 주소)
//   ZOHO_APP_PASSWORD  Zoho 앱 비밀번호(계정 비밀번호 아님)
//   NOTIFY_TO          (선택) 수신 주소. 없으면 ZOHO_USER 로 보낸다
//   ZOHO_SMTP_HOST     (선택) 기본 smtp.zoho.com. 계정이 EU/IN 이면 smtp.zoho.eu / .in
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZOHO_USER = Deno.env.get("ZOHO_USER") ?? "";
const ZOHO_PASS = Deno.env.get("ZOHO_APP_PASSWORD") ?? "";
const NOTIFY_TO = Deno.env.get("NOTIFY_TO") || ZOHO_USER;
const SMTP_HOST = Deno.env.get("ZOHO_SMTP_HOST") || "smtp.zoho.com";

// 위조 방지 창(초). 트리거는 INSERT 직후에 호출하므로 넉넉히 잡아도 5분이면 충분하다.
const MAX_AGE_SEC = 300;

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function seoul(iso: string): string {
  // 서버는 UTC. 운영자가 읽을 시각은 한국 시간이어야 한다.
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  if (!ZOHO_USER || !ZOHO_PASS) {
    console.error("ZOHO_USER / ZOHO_APP_PASSWORD 시크릿이 비어 있다");
    return new Response(JSON.stringify({ error: "smtp not configured" }), { status: 500 });
  }

  let id: string | undefined;
  try {
    const body = await req.json();
    // 트리거는 {id} 를 보내지만, Supabase 표준 웹훅 형태({record:{...}})로도 받아 둔다.
    id = body?.id ?? body?.record?.id;
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
  }
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400 });

  // 본문을 믿지 않고 원본을 다시 읽는다.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/ter_requests?id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
  );
  if (!res.ok) {
    console.error("row fetch failed", res.status, await res.text());
    return new Response(JSON.stringify({ error: "fetch failed" }), { status: 502 });
  }
  const rows = await res.json();
  const row = rows?.[0];
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });

  const ageSec = (Date.now() - new Date(row.created_at).getTime()) / 1000;
  if (ageSec > MAX_AGE_SEC) {
    console.warn("too old, skipping", id, ageSec);
    return new Response(JSON.stringify({ skipped: "stale" }), { status: 200 });
  }

  const when = seoul(row.created_at);
  const html = `
<div style="font-family:-apple-system,'Malgun Gothic',sans-serif;font-size:15px;line-height:1.75;color:#13261F">
  <p style="margin:0 0 18px"><b style="color:#0E6E54">약사로 터</b> 리포트 신청이 들어왔습니다.</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px">
    <tr><td style="padding:9px 12px;background:#FAFAF5;border:1px solid #E2E4DE;width:110px"><b>주소·지역</b></td>
        <td style="padding:9px 12px;border:1px solid #E2E4DE">${esc(row.addr)}</td></tr>
    <tr><td style="padding:9px 12px;background:#FAFAF5;border:1px solid #E2E4DE"><b>회신 메일</b></td>
        <td style="padding:9px 12px;border:1px solid #E2E4DE"><a href="mailto:${esc(row.email)}">${esc(row.email)}</a></td></tr>
    <tr><td style="padding:9px 12px;background:#FAFAF5;border:1px solid #E2E4DE"><b>아는 조건</b></td>
        <td style="padding:9px 12px;border:1px solid #E2E4DE">${row.note ? esc(row.note).replace(/\n/g, "<br>") : "(없음)"}</td></tr>
    <tr><td style="padding:9px 12px;background:#FAFAF5;border:1px solid #E2E4DE"><b>신청 시각</b></td>
        <td style="padding:9px 12px;border:1px solid #E2E4DE">${esc(when)}</td></tr>
  </table>
  <p style="margin:18px 0 0;font-size:13.5px;color:#7A7F74">
    안내한 회신 기한은 3~5일입니다. 회신을 마친 신청은 1년 뒤 파기 대상입니다(처리방침 제2조).
  </p>
</div>`.trim();

  const text = [
    "[약사로 터] 리포트 신청",
    `주소·지역: ${row.addr}`,
    `회신 메일: ${row.email}`,
    `아는 조건: ${row.note || "(없음)"}`,
    `신청 시각: ${when}`,
  ].join("\n");

  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: 465,
      tls: true,
      auth: { username: ZOHO_USER, password: ZOHO_PASS },
    },
  });

  try {
    await client.send({
      from: ZOHO_USER,
      to: NOTIFY_TO,
      replyTo: row.email, // 메일에서 바로 답장하면 신청자에게 간다
      subject: `[약사로 터] 신청 — ${row.addr}`,
      content: text,
      html,
    });
  } catch (err) {
    console.error("smtp send failed", err);
    return new Response(JSON.stringify({ error: "send failed" }), { status: 502 });
  } finally {
    await client.close().catch(() => {});
  }

  return new Response(JSON.stringify({ sent: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
