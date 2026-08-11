// ter-notify — 「약사로 터」 리포트 신청이 들어오면 운영 메일로 알린다.
//
// 흐름:  landing /ter 폼 → ter_requests INSERT → (트리거 055) pg_net → 이 함수 → Resend
//
// 왜 Resend 인가:
//   처음에는 Zoho SMTP 로 붙였다. Zoho 는 이미 처리방침 제5·6조에 수탁자로 올라 있어
//   메일에 신청 내용을 담아도 방침을 손대지 않아도 되기 때문이다.
//   그런데 **Zoho 무료 플랜은 SMTP 접근이 잠겨 있어** 앱 비밀번호가 맞아도 535 로 막힌다.
//   (그 전에 denomailer 가 한글 btoa 에서 죽는 문제도 있었고, SMTP 직접 구현으로 넘겼었다.)
//
// 그래서 알림 내용을 비운다:
//   Resend 가 신청자의 주소·이메일을 실어 나르면 처리방침에 수탁자·국외이전을 추가해야 한다.
//   기본값은 "새 신청 1건"만 보내고 상세는 대시보드에서 본다 → Resend 는 개인정보를 처리하지 않는다.
//   NOTIFY_DETAIL=full 로 켜면 상세를 담지만, **그때는 방침 제5·6조 개정이 선행돼야 한다.**
//
// 필요한 시크릿(대시보드 → Edge Functions → Secrets):
//   RESEND_API_KEY   필수. resend.com → API Keys
//   NOTIFY_TO        (선택) 수신 주소. 기본 admin@yaksaro.co.kr
//   RESEND_FROM      (선택) 발신. 기본 onboarding@resend.dev
//                    ※ 도메인 인증 전에는 onboarding@resend.dev 로만 보낼 수 있고,
//                      수신자도 Resend 계정 주소로 제한된다. yaksaro.co.kr 을 인증하면 풀린다.
//   NOTIFY_DETAIL    (선택) "full" 이면 신청 내용을 메일에 담는다 — 방침 개정 후에만 켤 것
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY_TO = Deno.env.get("NOTIFY_TO") || "admin@yaksaro.co.kr";
const RESEND_FROM = Deno.env.get("RESEND_FROM") || "Yaksaro Ter <onboarding@resend.dev>";
const DETAIL = (Deno.env.get("NOTIFY_DETAIL") || "").toLowerCase() === "full";

const MAX_AGE_SEC = 300;   // 위조 방지 창(초)
const DASHBOARD =
  "https://supabase.com/dashboard/project/tjtugyoexwsqaquheega/editor";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function seoul(iso: string): string {
  // 서버는 UTC. 운영자가 읽을 시각은 한국 시간이어야 한다.
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function shell(inner: string): string {
  return `
<div style="font-family:-apple-system,'Malgun Gothic',sans-serif;font-size:15px;line-height:1.75;color:#13261F">
${inner}
</div>`.trim();
}

// 핸들러가 예외로 죽으면 플랫폼이 본문 없는 "Internal Server Error" 만 돌려줘서
// 원인을 알 수 없다. 밖에서 한 번 더 받아 이유를 남긴다.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("unhandled", msg);
    return new Response(JSON.stringify({ error: "unhandled", message: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  if (!RESEND_KEY) {
    console.error("RESEND_API_KEY 시크릿이 비어 있다");
    return new Response(JSON.stringify({ error: "resend not configured" }), { status: 500 });
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

  // 본문의 id 를 믿지 않고 service_role 로 원본을 다시 읽는다.
  // anon 키는 랜딩 HTML 에 공개돼 있어 "호출자 신원"으로는 위조를 막지 못하기 때문이다.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/ter_requests?id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
  );
  if (!res.ok) {
    console.error("row fetch failed", res.status, await res.text());
    return new Response(JSON.stringify({ error: "fetch failed" }), { status: 502 });
  }
  const row = (await res.json())?.[0];
  if (!row) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });

  const ageSec = (Date.now() - new Date(row.created_at).getTime()) / 1000;
  if (ageSec > MAX_AGE_SEC) {
    console.warn("too old, skipping", id, ageSec);
    return new Response(JSON.stringify({ skipped: "stale" }), { status: 200 });
  }

  const when = seoul(row.created_at);

  // ── 기본: 내용 없는 알림. 신청 시각 외에는 아무것도 싣지 않는다 ──────────────
  let subject = "[약사로 터] 새 신청 1건";
  let text = [
    "약사로 터에 새 신청이 1건 들어왔습니다.",
    `신청 시각: ${when}`,
    "",
    "신청 내용은 대시보드에서 확인해 주세요.",
    DASHBOARD,
    "",
    "(개인정보가 메일 발송 업체를 거치지 않도록 내용은 담지 않습니다.)",
  ].join("\n");
  let html = shell(`
  <p style="margin:0 0 18px"><b style="color:#0E6E54">약사로 터</b>에 새 신청이 <b>1건</b> 들어왔습니다.</p>
  <p style="margin:0 0 18px">신청 시각 ${esc(when)}</p>
  <p style="margin:0 0 18px">
    <a href="${DASHBOARD}" style="display:inline-block;padding:11px 20px;border-radius:11px;background:#0E6E54;color:#FAFAF5;text-decoration:none;font-weight:700">대시보드에서 확인하기</a>
  </p>
  <p style="margin:0;font-size:13.5px;color:#7A7F74">
    개인정보가 메일 발송 업체를 거치지 않도록 신청 내용은 담지 않았습니다.
  </p>`);

  // ── NOTIFY_DETAIL=full: 상세 포함. 처리방침 제5·6조 개정이 선행돼야 한다 ────
  if (DETAIL) {
    subject = `[약사로 터] 신청 — ${row.addr}`;
    text = [
      "[약사로 터] 리포트 신청",
      `주소·지역: ${row.addr}`,
      `회신 메일: ${row.email}`,
      `아는 조건: ${row.note || "(없음)"}`,
      `신청 시각: ${when}`,
    ].join("\n");
    const cell = "padding:9px 12px;border:1px solid #E2E4DE";
    const head = `${cell};background:#FAFAF5;width:110px`;
    html = shell(`
  <p style="margin:0 0 18px"><b style="color:#0E6E54">약사로 터</b> 리포트 신청이 들어왔습니다.</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px">
    <tr><td style="${head}"><b>주소·지역</b></td><td style="${cell}">${esc(row.addr)}</td></tr>
    <tr><td style="${head}"><b>회신 메일</b></td><td style="${cell}"><a href="mailto:${esc(row.email)}">${esc(row.email)}</a></td></tr>
    <tr><td style="${head}"><b>아는 조건</b></td><td style="${cell}">${row.note ? esc(row.note).replace(/\n/g, "<br>") : "(없음)"}</td></tr>
    <tr><td style="${head}"><b>신청 시각</b></td><td style="${cell}">${esc(when)}</td></tr>
  </table>
  <p style="margin:18px 0 0;font-size:13.5px;color:#7A7F74">
    안내한 회신 기한은 3~5일입니다. 회신을 마친 신청은 1년 뒤 파기 대상입니다(처리방침 제2조).
  </p>`);
  }

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [NOTIFY_TO],
      subject,
      text,
      html,
      // 상세를 담을 때만 답장이 신청자에게 가도록 한다.
      // 내용 없는 알림에 reply_to 를 붙이면 그것만으로 신청자 주소가 Resend 를 거친다.
      ...(DETAIL ? { reply_to: row.email } : {}),
    }),
  });

  if (!send.ok) {
    const body = await send.text();
    console.error("resend failed", send.status, body);
    return new Response(
      JSON.stringify({ error: "send failed", status: send.status, message: body.slice(0, 400) }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ sent: true, detail: DETAIL }), {
    headers: { "Content-Type": "application/json" },
  });
}
