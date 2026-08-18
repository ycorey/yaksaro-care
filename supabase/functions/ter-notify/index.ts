// ter-notify — 「약사로 터」 리포트 신청이 들어오면 운영 메일로 알린다.
//
// 흐름:  landing /ter 폼 → ter_requests INSERT → (트리거 055) pg_net → 이 함수 → Gmail SMTP
//
// 발송 수단을 여기까지 온 경위:
//   ① Zoho SMTP — 이미 처리방침 제5·6조에 수탁자로 올라 있어 내용을 담아도 됐지만,
//      **무료 플랜은 SMTP 접근이 잠겨 있어** 앱 비밀번호가 맞아도 535 로 막힌다.
//   ② Resend — 가입 단계에서 막혔다.
//   ③ Gmail — 무료 계정도 앱 비밀번호로 SMTP 를 연다. 새 업체를 붙이지 않아도 된다.
//   (denomailer 1.6.0 은 한글이 들어가면 btoa 에서 죽어 못 쓴다. 그래서 SMTP 를 직접 말한다.)
//
// 알림에 내용을 담지 않는 이유:
//   메일 발송자가 신청자의 주소·이메일을 실어 나르면 처리방침의 수탁 범위를 넓혀야 한다.
//   보내는 것은 "새 신청 1건 + 시각 + 대시보드 링크"뿐이다 → 개인정보가 메일을 타지 않는다.
//   처리방침 제6조가 이 사실을 그대로 확언한다("신청자의 개인정보는 담지 않습니다").
//   (제5조 수탁자 표의 Google 위탁업무에는 통계 분석과 함께 알림 메일 발송이 이미 포함돼 있다.)
//
//   **NOTIFY_DETAIL=full 분기는 삭제했다(2026-08-16).** 시크릿 한 줄만 바꾸면 제6조가 곧바로
//   거짓이 되는데 그것을 막는 장치가 주석뿐이었다. 켜도 흔적이 남지 않아 사후 확인도 안 된다.
//   상세를 담아야 할 일이 생기면 **제5조 위탁업무·제6조 이전항목을 먼저 개정하고** 그때 되살린다.
//   방침보다 코드가 앞서가지 않게 하는 것이 요점이다.
//
// 필요한 시크릿(대시보드 → Edge Functions → Secrets):
//   GMAIL_USER          발송에 쓸 구글 계정 주소 (SMTP 로그인 = 발신 주소)
//   GMAIL_APP_PASSWORD  구글 앱 비밀번호 16자리. 계정 비밀번호 아님. 2단계 인증 필요
//   NOTIFY_TO           (선택) 수신 주소. 기본 admin@yaksaro.co.kr
//   SMTP_HOST           (선택) 기본 smtp.gmail.com
//   (NOTIFY_DETAIL 은 더 이상 읽지 않는다. 남아 있다면 지워도 된다.)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// 붙여넣기로 딸려 들어온 공백·줄바꿈·따옴표는 걷어낸다. 남아 있으면 Gmail 이 535 로 거절한다.
const SMTP_USER = (Deno.env.get("GMAIL_USER") ?? "").trim().replace(/^["']|["']$/g, "");
// 앱 비밀번호는 구글 화면에서 4자씩 띄어 보여준다. 공백이 섞여 들어와도 통과시킨다.
const SMTP_PASS = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/["']/g, "").replace(/\s+/g, "");
const NOTIFY_TO = Deno.env.get("NOTIFY_TO") || "admin@yaksaro.co.kr";
const SMTP_HOST = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";

const MAX_AGE_SEC = 300;          // 위조 방지 창(초)
const SMTP_TIMEOUT_MS = 20000;
// 테이블 에디터 딥링크. 뒤 숫자는 ter_requests 의 oid 로, 이게 없으면 에디터 첫 화면만 열려
// 어느 테이블인지 못 찾는다. 테이블을 drop/create 하면 oid 가 바뀌니 그때 갱신할 것
// (확인: select oid from pg_class where relname='ter_requests').
const DASHBOARD = Deno.env.get("DASHBOARD_URL") ||
  "https://supabase.com/dashboard/project/tjtugyoexwsqaquheega/editor/18868";

// ── 인코딩 ────────────────────────────────────────────────────────────────────
function b64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);   // 여기 들어오는 건 항상 바이트(latin1 범위)라 안전하다
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
 *
 * 주의 — 여기 CR/LF 가 살아서 들어오면 그대로 **헤더 인젝션**이 된다(Bcc: 주입 → 제3자 복사 발송).
 * 예전 구현은 `/^[\x00-\x7F]*$/` 로 "ASCII 면 그대로" 통과시켰는데, CR(\x0D)·LF(\x0A) 가
 * 하필 그 범위 안이라 개행이 무사통과했다. 제어문자를 먼저 걷어낸 뒤에 판정한다.
 * DB 쪽에도 같은 방어를 세워 뒀다(062: addr !~ '[\r\n]') — 폼을 우회한 INSERT 까지 막으려면
 * 저장 시점에도 있어야 하기 때문이다. 둘 중 하나만 있으면 안 된다.
 */
function encodeHeader(raw: string): string {
  // CR·LF·NUL 등 헤더를 깨뜨리는 C0 제어문자는 공백으로 치환한다(TAB 은 접힘에 쓰이므로 남긴다).
  const s = String(raw ?? "").replace(/[\x00-\x08\x0A-\x1F\x7F]/g, " ");
  if (/^[\x20-\x7E\t]*$/.test(s)) return s;   // 인쇄 가능한 ASCII 뿐이면 그대로
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
  to: string; replyTo?: string; subject: string; text: string; html: string;
}) {
  const smtp = new Smtp();
  try {
    await smtp.connect(SMTP_HOST, 465);
    await smtp.cmd("EHLO yaksaro.co.kr", 250);
    await smtp.cmd("AUTH LOGIN", 334);
    await smtp.cmd(b64utf8(SMTP_USER), 334);
    await smtp.cmd(b64utf8(SMTP_PASS), 235);   // 235 = 인증 성공
    await smtp.cmd(`MAIL FROM:<${SMTP_USER}>`, 250);
    await smtp.cmd(`RCPT TO:<${opts.to}>`, 250, 251);

    const boundary = `b_${crypto.randomUUID().replace(/-/g, "")}`;
    const headers = [
      `From: ${encodeHeader("약사로 터")} <${SMTP_USER}>`,
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

function shell(inner: string): string {
  return `
<div style="font-family:-apple-system,'Malgun Gothic',sans-serif;font-size:15px;line-height:1.75;color:#13261F">
${inner}
</div>`.trim();
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
  if (!SMTP_USER || !SMTP_PASS) {
    console.error("GMAIL_USER / GMAIL_APP_PASSWORD 시크릿이 비어 있다");
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

  // 본문의 id 를 믿지 않고 service_role 로 원본을 다시 읽는다.
  // anon 키는 랜딩 HTML 에 공개돼 있어 "호출자 신원"으로는 위조를 막지 못하기 때문이다.
  //
  // select 는 **쓰는 컬럼만** 가져온다. 알림에 실리는 건 시각뿐인데 예전엔 select=* 로
  // 주소·이메일·자유기재까지 함수 메모리로 끌어왔다. "개인정보가 메일을 타지 않는다"는 설계는
  // "DB 밖으로 나가지 않는다"까지 가야 완성된다. 예외 경로에서 우발적으로 노출될 표면도 함께 준다.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/ter_requests?id=eq.${encodeURIComponent(id)}&select=created_at,notified_at`,
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

  // 1행 = 1통. 5분 창 안에서는 같은 id 로 몇 번을 불러도 한 번만 보낸다.
  // 057 의 rate limit 은 INSERT 만 세므로, 자기 행의 id 를 아는 사람이 이 함수를 반복 호출하면
  // 메일을 폭주시킬 수 있었다(= Gmail 이 막히면 알림 경로 자체가 죽는, 057 이 경고한 그 실패 모드).
  if (row.notified_at) {
    console.warn("already notified, skipping", id);
    return new Response(JSON.stringify({ skipped: "already-notified" }), { status: 200 });
  }

  const when = seoul(row.created_at);

  // ── 내용 없는 알림. 신청 시각 외에는 아무것도 싣지 않는다 ────────────────────
  const subject = "[약사로 터] 새 신청 1건";
  const text = [
    "약사로 터에 새 신청이 1건 들어왔습니다.",
    `신청 시각: ${when}`,
    "",
    "신청 내용은 대시보드에서 확인해 주세요.",
    DASHBOARD,
    "",
    "(개인정보가 메일을 타지 않도록 내용은 담지 않습니다.)",
  ].join("\n");
  const html = shell(`
  <p style="margin:0 0 18px"><b style="color:#0E6E54">약사로 터</b>에 새 신청이 <b>1건</b> 들어왔습니다.</p>
  <p style="margin:0 0 18px">신청 시각 ${esc(when)}</p>
  <p style="margin:0 0 18px">
    <a href="${DASHBOARD}" style="display:inline-block;padding:11px 20px;border-radius:11px;background:#0E6E54;color:#FAFAF5;text-decoration:none;font-weight:700">대시보드에서 확인하기</a>
  </p>
  <p style="margin:0;font-size:13.5px;color:#7A7F74">
    개인정보가 메일을 타지 않도록 신청 내용은 담지 않았습니다.
  </p>`);

  try {
    // 연결이 매달리면 아이솔레이트째 타임아웃되므로 우리가 먼저 끊는다.
    await Promise.race([
      sendMail({ to: NOTIFY_TO, subject, text, html }),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("smtp: timeout")), SMTP_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("smtp send failed", msg);
    // 자격증명 진단(길이·@ 포함 여부)은 **서버 로그에만** 남긴다.
    // 예전엔 응답 본문에 실었는데, 이 함수는 verify_jwt 라도 통과에 필요한 것이
    // **랜딩 HTML 에 공개된 anon 키**뿐이라 사실상 누구나 호출할 수 있다.
    // 비밀번호 길이는 그 자체로 무차별 대입의 탐색 공간을 좁혀준다 — 설정을 맞춘 지금은
    // 진단값을 밖으로 내보낼 이유가 없다.
    console.error("smtp creds shape", {
      userLen: SMTP_USER.length, userHasAt: SMTP_USER.includes("@"), passLen: SMTP_PASS.length,
    });
    return new Response(JSON.stringify({
      error: "send failed",
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 발송에 성공한 뒤에만 도장을 찍는다. 먼저 찍으면 실패했을 때 재시도 경로가 막힌다.
  // 이 UPDATE 가 실패해도 메일은 이미 나갔으므로 200 을 돌려주되, 로그에는 남긴다
  // (도장이 안 찍힌 행은 재호출 시 한 통 더 갈 수 있다 — 조용히 넘기지 않는다).
  const stamp = await fetch(
    `${SUPABASE_URL}/rest/v1/ter_requests?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    },
  );
  if (!stamp.ok) console.error("notified_at stamp failed", id, stamp.status, await stamp.text());

  return new Response(JSON.stringify({ sent: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
