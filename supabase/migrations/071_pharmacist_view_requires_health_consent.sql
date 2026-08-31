-- 071: 약사 열람에 §23 민감정보 동의를 AND 조건으로 추가한다.
--
-- 왜: 014 의 `pharmacist_can_view()` 는 **단골약국 공개 동의**(`consent_pharmacist_view`)만 본다.
--     그래서 §23 동의 게이트(2026-08-31)를 세운 뒤 이런 상태가 성립한다 —
--         본인은 자기 복약을 못 보는데(게이트에 막혀 /consent 로),
--         약사는 그 사람의 복약을 본다.
--     운영 실측(2026-08-31): `consent_pharmacist_view = true` 인 3명 중 **2명이
--     `consent_health = false`** 다. 즉 이미 실재하는 상태다.
--
--     §23 은 건강정보 **처리**에 대한 동의이고, 제3자(약사)에게 보이는 것은 그 처리의
--     한 형태다. 상위 동의 없이 하위 동의만으로 열려 있으면 안 된다.
--
-- 효과: `consent_health = false` 인 환자는 약사 대시보드에서 즉시 보이지 않게 된다.
--       그 환자가 `/consent` 에서 동의하면 다음 쿼리부터 다시 보인다(추가 조작 불필요).
--
-- 안전: 함수 본문만 바꾼다. 이 함수를 쓰는 정책들(user_medications·user_prescriptions·
--       profiles·medication_schedules 등)은 그대로 두므로 정책 재생성이 없다.
--
-- 적용: Supabase SQL Editor 에서 직접 실행(이 저장소 관례).
-- 롤백: 아래에서 `and p.consent_health = true` 한 줄을 빼고 다시 실행하면 014 상태로 돌아간다.

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
      and p.consent_health = true          -- 071: 상위 동의(§23)가 없으면 하위 동의도 열지 않는다
  );
$$;

revoke all on function public.pharmacist_can_view(uuid) from public;
grant execute on function public.pharmacist_can_view(uuid) to authenticated;

-- 확인:
--   select p.id, p.consent_health, p.consent_pharmacist_view
--   from public.profiles p where p.consent_pharmacist_view;
-- (consent_health = false 인 행이 있으면 그 사람은 이제 약사에게 보이지 않는다)
