-- 053: pharmacist_patient_view 를 읽기 전용으로 확정 (051 의 결함 수정)
--
-- 051 의 REVOKE 가 `FROM PUBLIC, anon` 만 지정해 **authenticated 를 빠뜨렸다**.
-- Supabase 는 뷰 생성 시 authenticated 에 ALL 을 기본 부여하므로, 뒤이은 GRANT SELECT 로는
-- 아무것도 좁혀지지 않았고 실측 ACL 이 `authenticated=arwdDxtm` 였다.
--
-- 이 뷰는 단일 테이블·비집계 → auto-updatable 이고, 소유자(postgres) 권한으로 실행된다.
-- 따라서 약사 계정이
--   DELETE /rest/v1/pharmacist_patient_view?id=eq.<환자>
-- 로 동의 환자의 profiles 행(동의 이력·단골·설정·role)을 통째로 삭제할 수 있었다.
-- profiles 의 RLS 와 046 의 컬럼 단위 GRANT 를 둘 다 우회하는 경로였다.
--
-- 051 이 닫으려던 것(약사의 과다 열람)을 051 이 더 나쁜 형태로 다시 연 셈이라, 즉시 회수한다.
-- 회귀 방지: e2e/pharmacist-rls-qa.mjs 가 이제 뷰에 대한 UPDATE·DELETE 시도까지 단언한다.

REVOKE ALL ON public.pharmacist_patient_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pharmacist_patient_view TO authenticated;

ALTER VIEW public.pharmacist_patient_view SET (security_barrier = true);
