-- 062: addr 에 개행을 금지한다 — SMTP 헤더 인젝션 차단.
--
-- 054 의 addr 제약은 길이만 본다(1~200자). 그런데 ter-notify 의 encodeHeader 는
--   if (/^[\x00-\x7F]*$/.test(s)) return s;   // ASCII 뿐이면 그대로
-- 로 시작하는데, CR(\x0D)·LF(\x0A)가 이 범위 안이라 **개행이 인코딩 없이 통과**했다.
-- addr 가 메일 제목에 들어가는 경로(NOTIFY_DETAIL)에서는 그대로 Bcc: 주입이 된다 —
-- 운영자 알림이 제3자에게 복사 발송되는, 개인정보 유출 경로다.
--
-- 함수 쪽은 같은 커밋에서 고쳤지만(개행 포함 시 RFC 2047 강제 인코딩),
-- **폼을 우회한 경로까지 막으려면 DB 에 세워야 한다.** anon 키는 공개돼 있어
-- PostgREST 로 직접 POST 하면 <input type="text"> 의 개행 차단은 아무 의미가 없다.
-- 방어는 발송 시점이 아니라 저장 시점에 있어야 한다.
--
-- note 는 본문에만 쓰이고 esc() 로 이스케이프되므로 개행을 허용한다(여러 줄 입력이 정상이다).
-- email 은 054 의 정규식이 이미 공백류를 배제한다.

update public.ter_requests
   set addr = regexp_replace(addr, '[\r\n]+', ' ', 'g')
 where addr ~ '[\r\n]';

alter table public.ter_requests
  drop constraint if exists ter_requests_addr_no_newline;
alter table public.ter_requests
  add constraint ter_requests_addr_no_newline
  check (addr !~ '[\r\n]');
