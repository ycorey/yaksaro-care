-- 050: 탈퇴 시 개인정보가 남지 않도록 FK CASCADE 보강
--
-- 배경: auth.users 를 참조하는 FK CASCADE 가 일부 테이블에만 있었다.
--   있었음: profiles · user_prescriptions · dur_shadow_logs ·
--           supplement_interaction_shadow_logs · pharmacy_requests · pharmacy_patient_notes · api_quota
--   없었음: user_medications · medication_check_logs · medication_schedules ·
--           members · push_subscriptions · pharmacies.owner_id
--
-- 즉 유저를 삭제하면 **처방전은 지워지는데 정작 복약 목록·복약 체크 이력·복용 일정·
-- 가족 멤버·푸시 구독은 남는** 직관과 반대인 상태였다. 삭제된 유저 앞으로 복약 알림
-- 푸시가 계속 시도되기도 한다.
--
-- 약관 제8조와 개인정보 처리방침은 "탈퇴 시 지체 없이 파기"를 약속하고 있으므로,
-- 수동 삭제(대시보드/Admin API)만으로 그 약속이 지켜지도록 DB 레벨에서 보장한다.
--
-- 적용 시점 고아 행: 6개 테이블 모두 0건 확인 → FK 생성이 기존 데이터에 막히지 않는다.

ALTER TABLE public.user_medications
  DROP CONSTRAINT IF EXISTS user_medications_user_id_fkey,
  ADD  CONSTRAINT user_medications_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.medication_check_logs
  DROP CONSTRAINT IF EXISTS medication_check_logs_user_id_fkey,
  ADD  CONSTRAINT medication_check_logs_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.medication_schedules
  DROP CONSTRAINT IF EXISTS medication_schedules_user_id_fkey,
  ADD  CONSTRAINT medication_schedules_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_owner_id_fkey,
  ADD  CONSTRAINT members_owner_id_fkey
       FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_fkey,
  ADD  CONSTRAINT push_subscriptions_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 약국은 소유 약사 계정이 사라지면 접근할 주체가 없다.
-- (약국 계정 발급은 create-pharmacy-account.mjs 가 유저와 약국을 한 쌍으로 만든다)
ALTER TABLE public.pharmacies
  DROP CONSTRAINT IF EXISTS pharmacies_owner_id_fkey,
  ADD  CONSTRAINT pharmacies_owner_id_fkey
       FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
