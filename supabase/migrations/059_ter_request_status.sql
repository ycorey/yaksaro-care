-- 059: /ter 신청에 처리 상태.
--
-- 054 의 ter_requests 에는 상태가 없어, 신청이 쌓여도 **처리했는지 알 방법이 없었다.**
-- 알림 메일은 "1건 들어왔다" 만 알려주고 그 뒤는 기억에 의존한다 — 놓쳐도 아무 신호가 없다.
-- (오늘 내내 다룬 "조용한 실패" 와 같은 모양이다. 이번엔 사람이 하는 일 쪽이다.)
--
-- 상태 변경은 운영자(service_role = Supabase 대시보드)만 한다. anon 은 여전히 INSERT 만 가능하고
-- SELECT·UPDATE 정책이 없으므로 신청자가 남의 상태를 보거나 바꿀 수 없다.

alter table public.ter_requests
  add column if not exists status text not null default 'new'
    check (status in ('new', 'in_progress', 'done', 'dropped')),
  add column if not exists status_at timestamptz,
  add column if not exists handler_memo text;

alter table public.ter_requests
  drop constraint if exists ter_requests_handler_memo_len;
alter table public.ter_requests
  add constraint ter_requests_handler_memo_len
  check (handler_memo is null or length(handler_memo) <= 2000);

-- 상태가 바뀐 시각을 자동으로 남긴다 — 손으로 채우게 하면 결국 안 채워진다.
create or replace function public.ter_requests_touch_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.status_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.ter_requests_touch_status() from public, anon, authenticated;

drop trigger if exists ter_requests_touch_status on public.ter_requests;
create trigger ter_requests_touch_status
  before update on public.ter_requests
  for each row execute function public.ter_requests_touch_status();

-- 미처리 건을 빠르게 뽑기 위한 인덱스(운영자가 가장 자주 보는 질의).
create index if not exists idx_ter_requests_status
  on public.ter_requests (status, created_at desc);

comment on column public.ter_requests.status is
  'new(접수) / in_progress(처리중) / done(회신완료) / dropped(취소·중복). 운영자만 변경.';
comment on column public.ter_requests.handler_memo is
  '운영 메모(처리 경위 등). 신청자에게 노출되지 않는다.';
