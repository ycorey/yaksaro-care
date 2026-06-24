-- 039: 약국 환자 특이사항 메모(약사 비공개). (pharmacy_id, patient_id) 쌍당 단일 메모. 환자 미노출.
create table if not exists public.pharmacy_patient_notes (
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  patient_id  uuid not null references auth.users(id)        on delete cascade,
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (pharmacy_id, patient_id)
);

alter table public.pharmacy_patient_notes enable row level security;

-- 약사: 자기 약국 + 동의·연결 환자에 한해 조회/작성/수정/삭제 (환자 정책 없음 → 환자 접근 0)
drop policy if exists "ppn_pharmacist_select" on public.pharmacy_patient_notes;
create policy "ppn_pharmacist_select" on public.pharmacy_patient_notes
  for select using (
    pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid())
    and public.pharmacist_can_view(patient_id)
  );

drop policy if exists "ppn_pharmacist_insert" on public.pharmacy_patient_notes;
create policy "ppn_pharmacist_insert" on public.pharmacy_patient_notes
  for insert with check (
    pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid())
    and public.pharmacist_can_view(patient_id)
  );

drop policy if exists "ppn_pharmacist_update" on public.pharmacy_patient_notes;
create policy "ppn_pharmacist_update" on public.pharmacy_patient_notes
  for update using (
    pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid())
    and public.pharmacist_can_view(patient_id)
  ) with check (
    pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid())
    and public.pharmacist_can_view(patient_id)
  );

drop policy if exists "ppn_pharmacist_delete" on public.pharmacy_patient_notes;
create policy "ppn_pharmacist_delete" on public.pharmacy_patient_notes
  for delete using (
    pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid())
    and public.pharmacist_can_view(patient_id)
  );

create index if not exists idx_ppn_pharmacy on public.pharmacy_patient_notes(pharmacy_id);
