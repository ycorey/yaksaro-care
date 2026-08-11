-- 054_ter_requests.sql
-- 랜딩페이지(landing-deploy) `/ter` — 「약사로 터」 무료 입지 리포트 신청 저장 테이블.
-- 038a_waitlist 와 같은 구조: 정적 HTML 폼이 익명(anon)으로 Supabase REST 에 직접 insert 한다.
-- 공개 폼이므로 insert 만 허용하고, select/update/delete 는 정책을 만들지 않아 전면 차단한다.
-- (신청 내역 열람은 service_role — Supabase 대시보드 — 로만 한다.)

create table if not exists public.ter_requests (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null,                       -- 리포트를 회신받을 주소
  addr        text        not null,                       -- 분석을 요청하는 주소 또는 관심 지역
  note        text,                                       -- 자유기재(층·평수·보증금·월세·같은 건물 병의원 등)
  agreed      boolean     not null default false,         -- 개인정보 수집·이용 동의 여부(폼에서 필수 체크)
  created_at  timestamptz not null default now(),
  source      text        not null default 'landing-ter'
);

comment on table public.ter_requests is '약사로 터 무료 입지 리포트 신청 (공개 폼, insert-only)';

-- waitlist 와 달리 email UNIQUE 를 걸지 않는다 — 한 사람이 여러 자리를 신청하는 것이 정상 사용이다.
-- 길이·형식 제약은 052 의 waitlist 와 동일한 이유로 DB 레벨에 건다(클라이언트 maxlength 는 우회 가능).
alter table public.ter_requests
  drop constraint if exists ter_requests_email_sane;
alter table public.ter_requests
  add constraint ter_requests_email_sane
  check (length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

alter table public.ter_requests
  drop constraint if exists ter_requests_addr_len;
alter table public.ter_requests
  add constraint ter_requests_addr_len
  check (length(addr) between 1 and 200);

alter table public.ter_requests
  drop constraint if exists ter_requests_note_len;
alter table public.ter_requests
  add constraint ter_requests_note_len
  check (note is null or length(note) <= 2000);

alter table public.ter_requests
  drop constraint if exists ter_requests_source_len;
alter table public.ter_requests
  add constraint ter_requests_source_len
  check (length(source) <= 64);

-- 동의하지 않은 신청은 애초에 저장되지 않게 한다(방침 제3조·폼 필수 체크와 일치).
alter table public.ter_requests
  drop constraint if exists ter_requests_agreed_true;
alter table public.ter_requests
  add constraint ter_requests_agreed_true
  check (agreed = true);

alter table public.ter_requests enable row level security;

drop policy if exists "ter_requests anon insert" on public.ter_requests;
create policy "ter_requests anon insert"
  on public.ter_requests
  for insert
  to anon
  with check (true);

-- select/update/delete 정책 없음 → anon·authenticated 모두 읽기/수정/삭제 불가 (service_role 만 접근).

create index if not exists ter_requests_created_at_idx
  on public.ter_requests (created_at desc);
