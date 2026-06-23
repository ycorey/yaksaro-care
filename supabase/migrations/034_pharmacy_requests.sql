-- 단골약국 비임상 소통: 환자→약국 구조화 요청(예약·콜백·문의). 임상 상담은 앱에서 다루지 않음(전화/대면).
--
-- 동작 대상: QR로 연결된 B2B 단골약국(profiles.regular_pharmacy_id → pharmacies)만. 텍스트 등록 약국은
--   받을 약사 계정이 없어 대상 아님(앱은 전화 안내만). 약사는 자기 약국 요청을 보고 상태만 바꾼다(read-only 정신).

create table if not exists public.pharmacy_requests (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references auth.users(id)     on delete cascade,
  pharmacy_id   uuid not null references public.pharmacies(id) on delete cascade,
  member_id     uuid references public.members(id)          on delete set null,
  type          text not null check (type in ('callback','dispense_prep','pickup','consult_booking','stock_inquiry')),
  note          text,                                       -- 짧은 비임상 메모(선택)
  contact_phone text,                                       -- 콜백받을 번호(선택)
  status        text not null default 'open' check (status in ('open','acknowledged','done','canceled')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);

alter table public.pharmacy_requests enable row level security;

-- 환자: 본인 요청 조회 + 본인 단골약국으로만 작성 + 본인 요청 수정(취소)
drop policy if exists "preq_patient_select" on public.pharmacy_requests;
create policy "preq_patient_select" on public.pharmacy_requests
  for select using (auth.uid() = patient_id);

drop policy if exists "preq_patient_insert" on public.pharmacy_requests;
create policy "preq_patient_insert" on public.pharmacy_requests
  for insert with check (
    auth.uid() = patient_id
    and pharmacy_id = (select regular_pharmacy_id from public.profiles where id = auth.uid())
  );

drop policy if exists "preq_patient_update" on public.pharmacy_requests;
create policy "preq_patient_update" on public.pharmacy_requests
  for update using (auth.uid() = patient_id) with check (auth.uid() = patient_id);

-- 약사: 자기 약국(owner)으로 온 요청 조회 + 상태 변경(쓰기는 status/responded_at 한정 — 앱 레이어)
drop policy if exists "preq_pharmacist_select" on public.pharmacy_requests;
create policy "preq_pharmacist_select" on public.pharmacy_requests
  for select using (pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid()));

drop policy if exists "preq_pharmacist_update" on public.pharmacy_requests;
create policy "preq_pharmacist_update" on public.pharmacy_requests
  for update using (pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid()))
  with check (pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid()));

create index if not exists idx_preq_patient on public.pharmacy_requests(patient_id);
create index if not exists idx_preq_pharmacy_status on public.pharmacy_requests(pharmacy_id, status);
