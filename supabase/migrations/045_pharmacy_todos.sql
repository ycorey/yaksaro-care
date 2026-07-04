-- 045: 약국 내부용 수동 '오늘 할 일' 메모. 환자 비노출. 약국 owner(약사 본인)만 전권.
-- 약사 토큰 + RLS만 — service_role 우회 없음.
create table if not exists public.pharmacy_todos (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create index if not exists idx_pharmacy_todos_pharmacy
  on public.pharmacy_todos (pharmacy_id, done, created_at desc);

alter table public.pharmacy_todos enable row level security;

drop policy if exists pharmacy_todos_owner_all on public.pharmacy_todos;
create policy pharmacy_todos_owner_all on public.pharmacy_todos
  for all
  using  (pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid()))
  with check (pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid()));
