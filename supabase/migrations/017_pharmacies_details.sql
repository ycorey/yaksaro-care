-- 017_pharmacies_details.sql
-- 약국 셀프 온보딩용 컬럼 추가 + RLS

alter table public.pharmacies
  add column if not exists phone   text,
  add column if not exists address text;

-- pharmacies RLS (없으면 활성화, owner만 자기 약국 조회/수정)
alter table public.pharmacies enable row level security;

drop policy if exists "pharmacies_owner_select" on public.pharmacies;
create policy "pharmacies_owner_select" on public.pharmacies
  for select using (owner_id = auth.uid());

drop policy if exists "pharmacies_owner_update" on public.pharmacies;
create policy "pharmacies_owner_update" on public.pharmacies
  for update using (owner_id = auth.uid());

-- store 진입점(/store/[store_id])은 anon도 id/name 조회 필요
drop policy if exists "pharmacies_public_store_lookup" on public.pharmacies;
create policy "pharmacies_public_store_lookup" on public.pharmacies
  for select using (store_id is not null);
