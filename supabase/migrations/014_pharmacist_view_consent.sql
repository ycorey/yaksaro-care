-- 약사 모드: 약사가 동의한 단골 환자의 복약을 read-only로 보는 RLS
--
-- 핵심 계율:
--  · 관계(QR 단골 = profiles.regular_pharmacy_id) ≠ 동의.
--    환자의 명시적 opt-in 동의(consent_pharmacist_view)를 AND 조건으로 함께 건다.
--  · SELECT 전용(약사 쓰기 정책 없음). 동의 철회 시 다음 쿼리부터 즉시 차단.
--  · 게이트 로직은 SECURITY DEFINER 함수 1곳에 모아 RLS 재귀를 피하고 단일 출처화.

-- 1) 환자측 동의 컬럼 (opt-in, 기본 false)
alter table public.profiles
  add column if not exists consent_pharmacist_view    boolean     not null default false,
  add column if not exists consent_pharmacist_view_at timestamptz;

-- 2) 게이트 함수 — "지금 약사(auth.uid())가 patient의 단골약국 owner이고, patient가 동의함"
--    SECURITY DEFINER: 내부 profiles/pharmacies 조회는 RLS를 우회해 재귀를 피한다.
create or replace function public.pharmacist_can_view(patient uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.pharmacies ph on ph.id = p.regular_pharmacy_id
    where p.id = patient
      and ph.owner_id = auth.uid()
      and p.consent_pharmacist_view = true
  );
$$;

revoke all on function public.pharmacist_can_view(uuid) from public;
grant execute on function public.pharmacist_can_view(uuid) to authenticated;

-- 3) 기존 무효 정책 교체 (pharmacy_patients 기준 → 동작 안 함)
drop policy if exists "medications_pharmacist" on public.user_medications;

-- 4) 약사 SELECT 정책 (관계 AND 동의 — 함수 게이트)
--    create policy는 IF NOT EXISTS가 없어 재실행 시 42710 에러 → 각 정책을 drop 후 생성(idempotent).
drop policy if exists "medications_pharmacist_view" on public.user_medications;
create policy "medications_pharmacist_view" on public.user_medications
  for select using (public.pharmacist_can_view(user_id));

drop policy if exists "prescriptions_pharmacist_view" on public.user_prescriptions;
create policy "prescriptions_pharmacist_view" on public.user_prescriptions
  for select using (public.pharmacist_can_view(user_id));

-- 환자 이름·연락 등 식별 — 약사가 동의 환자 profile만 읽도록 (profiles_self와 OR로 병존)
drop policy if exists "profiles_pharmacist_view" on public.profiles;
create policy "profiles_pharmacist_view" on public.profiles
  for select using (public.pharmacist_can_view(id));

-- 약품/영양제 마스터(drugs/supplements)는 이미 authenticated read 허용이라 약사도 조인 가능.
-- user_medications/user_prescriptions/profiles 외 테이블엔 약사 정책을 추가하지 않는다(최소권한).
