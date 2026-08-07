-- 038_waitlist.sql
-- 랜딩페이지(landing-deploy) "출시 알림 받기" 이메일 신청 저장 테이블.
-- 정적 HTML 폼이 익명(anon)으로 Supabase REST에 직접 insert 한다.
-- 공개 폼이므로 insert 만 허용하고, select/update/delete 는 정책을 만들지 않아 전면 차단한다.

create table if not exists public.waitlist (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null unique,
  created_at  timestamptz not null default now(),
  source      text        not null default 'landing'
);

comment on table public.waitlist is '랜딩페이지 출시 알림 사전 신청 이메일 (공개 폼, insert-only)';

alter table public.waitlist enable row level security;

-- 익명 insert 만 허용. (email 은 클라이언트에서 소문자/trim 정규화 후 전송, 중복은 23505 → 앱단에서 조용히 성공 처리)
drop policy if exists "waitlist anon insert" on public.waitlist;
create policy "waitlist anon insert"
  on public.waitlist
  for insert
  to anon
  with check (true);

-- select/update/delete 정책 없음 → anon·authenticated 모두 읽기/수정/삭제 불가 (service_role 만 접근).
