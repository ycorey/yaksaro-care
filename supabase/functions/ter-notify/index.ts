// ter-notify — 「약사로 터」 리포트 신청이 들어오면 운영 메일로 알린다.
//
// 흐름:  landing /ter 폼 → ter_requests INSERT → (트리거 055) pg_net → 이 함수 → Zoho SMTP
//
// 인증에 관하여:
//   verify_jwt=true 라서 anon 키가 필요한데, anon 키는 랜딩 HTML 에 그대로 박혀 있는 공개 키다.
//   즉 "호출할 수 있는 사람"으로는 위조를 막지 못한다. 그래서 본문의 id 를 믿지 않고
//   service_role 로 **실제 행을 다시 읽어** 존재하고 충분히 최근일 때만 메일을 보낸다.
//
// SMTP 를 직접 말하는 이유:
//   denomailer 1.6.0 은 한글이 들어가면 btoa 단계에서
//   "Cannot encode string: string contains characters outside of the Latin1 range" 로 죽는다.
//   이 알림은 본문이 통째로 한글이라 그 라이브러리로는 성립하지 않는다.
//   그래서 UTF-8 → base64 인코딩을 우리가 직접 하고, 제목은 RFC 2047 인코디드워드로 접는다.
//
// 필요한 시크릿(대시보드 → Edge Functions → Secrets):
//   ZOHO_USER          예: admin@yaksaro.co.kr  (SMTP 로그인 계정 = 발신 주소)
//   ZOHO_APP_PASSWORD  Zoho 앱 비밀번호(계정 비밀번호 아님)
//   NOTIFY_TO          (선택) 수신 주소. 없으면 ZOHO_USER 로 보낸다
//   ZOHO_SMTP_HOST     (선택) 기본 smtp.zoho.com. 계정이 EU/IN 이면 smtp.zoho.eu / .in
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZOHO_USER = Deno.env.get("ZOHO_USER") ?? "";
const ZOHO_PASS = Deno.env.get("ZOHO_APP_PASSWORD") ?? "";
const NOTIFY_TO = Deno.env.get("NOTIFY_TO") || ZOHO_USER;
const SMTP_HOST = Deno.env.get("ZOHO_SMTP_HOST") || "smtp.zoho.com";

const MAX_AGE_SEC = 300;   // 위조 방지 창(초)
const SMTP_TIMEOUT_MS = 20000;

// ── 인코딩 ────────────────────────────────────────────────────────────────────
function b64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);   // 여기 들어오는 건 항상 latin1 범위(바이트)라 안전하다
}

function b64utf8(s: string): string {
  return b64(new TextEncoder().encode(s));
}

/** base64 본문을 76자로 접는다(RFC 2045). */
function foldBase64(s: string): string {
  return (s.match(/.{1,76}/g) ?? []).join("\r\n");
}

/**
 * 헤더용 RFC 2047 인코디드워드. 한 워드가 75자를 넘으면 안 되므로
 * **문자 경계**를 지키며 UTF-8 45바이트 단위로 쪼개 여러 워드로 접는다.
 */
function encodeHeader(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;   // ASCII 뿐이면 그대로
  const enc = new TextEncoder();
  const words: string[] = [];
  let chunk = "";
  let bytes = 0;
  for (const ch of s) {
    const n = enc.encode(ch).length;
    if (bytes + n > 45) {
      words.push(`=?UTF-8?B?${b64utf8(chunk)}?=`);
      chunk = "";
      bytes = 0;
    }
    chunk += ch;
    bytes += n;
  }
  if (chunk) words.push(`=?UTF-8?B?${b64utf8(chunk)}?=`);
  return words.join("\r\n ");   // 접힘(folding)은 CRLF + 공백
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function seoul(iso: string): string {
  // 서버는 UTC. 운영자가 읽을 시각은 한국 시간이어야 한다.
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

// ── 최소 SMTP 클라이언트 (implicit TLS, AUTH LOGIN) ──────────────────────────
class Smtp {
  #conn!: Deno.TlsConn;
  #buf = "";
  #dec = new TextDecoder();
  #enc = new TextEncoder();
  #chunk = new Uint8Array(4096);

  async connect(hostname: string, port: number) {
    this.#conn = await Deno.connectTls({ hostname, port });
    await this.#expect(220);
  }

  async #readLine(): Promise<string> {
    while (true) {
      const nl = this.#buf.indexOf("\r\n");
      if (nl >= 0) {
        const line = this.#buf.slice(0, nl);
        this.#buf = this.#buf.slice(nl + 2);
        return line;
      }
      const n = await this.#conn.read(this.#chunk);
      if (n === null) throw new Error("smtp: connection closed");
      this.#buf += this.#dec.decode(this.#chunk.subarray(0, n));
    }
  }

  /** 멀티라인 응답("250-...")을 끝까지 읽고 코드를 확인한다. */
  async #expect(...codes: number[]): Promise<string> {
    const lines: string[] = [];
    while (true) {
      const line = await this.#readLine();
      lines.push(line);
      if (/^\d{3} /.test(line)) break;      // 마지막 줄은 "250 " 처럼 공백
    }
    const last = lines[lines.length - 1];
    const code = Number(last.slice(0, 3));
    if (!codes.includes(code)) {
      throw new Error(`smtp: expected ${codes.join("/")}, got "${last}"`);
    }
    return lines.join("\n");
  }

  async cmd(line: string, ...codes: number[]): Promise<string> {
    await this.#conn.write(this.#enc.encode(line + "\r\n"));
    return await this.#expect(...codes);
  }

  /** DATA 본문 — 점으로 시작하는 줄은 점을 하나 덧붙인다(dot-stuffing). */
  async data(message: string) {
    await this.cmd("DATA", 354);
    const stuffed = message.split("\r\n")
      .map((l) => (l.startsWith(".") ? "." + l : l))
      .join("\r\n");
    await this.#conn.write(this.#enc.encode(stuffed + "\r\n.\r\n"));
    await this.#expect(250);
  }

  async quit() {
    try {
      await this.#conn.write(this.#enc.encode("QUIT\r\n"));
    } catch { /* 이미 닫혔으면 그만 */ }
    try { this.#conn.close(); } catch { /* noop */ }
  }
}

async function sendMail(opts: {
  from: string; to: string; replyTo?: string;
  subject: string; text: string; html: string;
}) {
  const smtp = new Smtp();
  try {
    await smtp.connect(SMTP_HOST, 465);
    await smtp.cmd(`EHLO yaksaro.co.kr`, 250);
    await smtp.cmd("AUTH LOGIN", 334);
    await smtp.cmd(b64utf8(ZOHO_USER), 334);
    await smtp.cmd(b64utf8(ZOHO_PASS), 235);   // 235 = 인증 성공
    await smtp.cmd(`MAIL FROM:<${opts.from}>`, 250);
    await smtp.cmd(`RCPT TO:<${opts.to}>`, 250, 251);

    const boundary = `b_${crypto.randomUUID().replace(/-/g, "")}`;
    const headers = [
      `From: ${opts.from}`,
      `To: ${opts.to}`,
      ...(opts.replyTo ? [`Reply-To: ${opts.replyTo}`] : []),
      `Subject: ${encodeHeader(opts.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ].join("\r\n");

    const body = [
      "",
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      "",
      foldBase64(b64utf8(opts.text)),
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      "",
      foldBase64(b64utf8(opts.html)),
      `--${boundary}--`,
    ].join("\r\n");

    await smtp.data(headers + "\r\n" + body);
  } finally {
    await smtp.quit();
  }
}

// ── 핸들러 ────────────────────────────────────────────────────────────────────
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
  const row = (await res.json())?.[0];
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

  try {
    // 연결이 매달리면 아이솔레이트째 타임아웃되므로 우리가 먼저 끊는다.
    await Promise.race([
      sendMail({
        from: ZOHO_USER,
        to: NOTIFY_TO,
        replyTo: row.email,   // 메일에서 바로 답장하면 신청자에게 간다
        subject: `[약사로 터] 신청 — ${row.addr}`,
        text,
        html,
      }),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("smtp: timeout")), SMTP_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("smtp send failed", msg);
    return new Response(JSON.stringify({ error: "send failed", message: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ sent: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
