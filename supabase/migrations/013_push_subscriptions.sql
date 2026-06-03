-- Web Push 구독 테이블 (복약 알림 푸시)
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "본인 구독 조회" on public.push_subscriptions;
create policy "본인 구독 조회" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "본인 구독 등록" on public.push_subscriptions;
create policy "본인 구독 등록" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "본인 구독 갱신" on public.push_subscriptions;
create policy "본인 구독 갱신" on public.push_subscriptions
  for update using (auth.uid() = user_id);

drop policy if exists "본인 구독 삭제" on public.push_subscriptions;
create policy "본인 구독 삭제" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
