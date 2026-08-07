-- 046: 보안 감사(2026-08-07) Critical 2건 + High 1건 차단
--
-- 배경: 3개 독립 보안 감사에서 중복 발견 + 운영 DB 카탈로그로 실증.
--   C1) end_expired_medications 가 anon 실행 가능 → 미인증 1회 호출로 전 사용자 복약 파괴
--   C2) pharmacies INSERT 가 열려 있어 누구나 약국 계정 자가 발급 → 동의 환자 건강정보 열람
--   H2) profiles.role 자기 UPDATE 가능 → /pharmacy 권한 상승
--
-- 원칙: 정상 경로(cron=service_role, 약국 발급=create-pharmacy-account.mjs=service_role)는
--       service_role 을 통하므로 아래 회수는 전부 무영향이다.

-- ─────────────────────────────────────────────────────────────
-- C1) SECURITY DEFINER 함수의 미인증/일반사용자 실행 차단
-- ─────────────────────────────────────────────────────────────

-- end_expired_medications: DEFINER(RLS 우회) + WHERE 절에 user_id 스코프 없음 +
-- 영향 범위를 호출자 파라미터(today)가 결정. today='2999-12-31' 이면 전 사용자 전 행이 대상.
-- 019/041 이 REVOKE 를 누락했다(014/031 은 올바르게 회수하고 있었음).
-- 유일한 정상 호출자: api/cron/medication-reminders/route.ts 의 admin.rpc(service_role).
REVOKE ALL ON FUNCTION public.end_expired_medications(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_expired_medications(date) TO service_role;

-- 아래 둘은 트리거 전용 함수다. 트리거 실행은 호출자의 EXECUTE 권한을 검사하지 않으므로
-- 회수해도 트리거는 정상 동작하고, /rest/v1/rpc/ 직접 호출만 막힌다.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pharmacy_requests_pin_immutable() FROM PUBLIC, anon, authenticated;

-- 주의: pharmacist_can_view(uuid)·is_self_member(uuid) 는 여기서 회수하지 않는다.
-- 이 둘을 참조하는 RLS 정책 8개가 전부 TO public 이라, anon EXECUTE 를 회수하면
-- 익명 조회가 "0건"이 아니라 "permission denied for function" 으로 실패한다.
-- 정석 수정은 해당 정책들을 TO authenticated 로 좁힌 뒤 회수하는 것 → 별도 마이그레이션.
-- (pharmacist_can_view 는 anon 일 때 auth.uid()=NULL 이라 항상 false 를 반환해 누수는 없다.)

-- ─────────────────────────────────────────────────────────────
-- C2) 약국 계정 자가 발급 차단
-- ─────────────────────────────────────────────────────────────

-- 001 의 pharmacies_owner 가 FOR ALL + WITH CHECK(auth.uid()=owner_id) 였다.
-- = "내가 owner 인 약국 행을 내가 INSERT" 허용. 017 이 select/update 전용 정책을 추가했지만
-- 이 FOR ALL 을 지우지 않아 permissive OR 로 INSERT 가 계속 열려 있었다.
-- 제거해도 조회·수정은 017 의 pharmacies_owner_select / _update 가 그대로 담당한다.
DROP POLICY IF EXISTS "pharmacies_owner" ON public.pharmacies;

-- 생성/삭제는 관리자(service_role) 전용으로 고정.
REVOKE INSERT, DELETE ON public.pharmacies FROM anon, authenticated;

-- 컬럼 단위 제한: Postgres 는 테이블 레벨 UPDATE 가 있으면 컬럼 REVOKE 가 무효이므로
-- 테이블 레벨을 회수한 뒤 허용 컬럼만 재부여한다.
-- 차단 대상: owner_id(소유권 이전) · subscription_status(과금 우회) · license_number(면허 위조).
REVOKE UPDATE ON public.pharmacies FROM anon, authenticated;
GRANT UPDATE (name, phone, address, store_id) ON public.pharmacies TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- H2) profiles.role 자기 승격 차단
-- ─────────────────────────────────────────────────────────────

-- role 은 proxy.ts:42 와 pharmacy/(app)/layout.tsx:19 의 권한 경계인데
-- profiles_self(FOR ALL) + 테이블 레벨 UPDATE 로 본인이 쓸 수 있었다.
-- 두 가드가 같은 조작 가능 값을 읽으므로 이중 방어가 성립하지 않았다.
-- role 승격은 scripts/create-pharmacy-account.mjs(service_role) 전용으로 고정한다.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;

-- 앱이 실제로 쓰는 컬럼만 재부여 (role 제외).
-- 소비처: api/profile/{settings,set-pharmacy,clear-pharmacy,pharmacist-consent}, lib/regular-pharmacy.ts
GRANT UPDATE (
  email,
  full_name,
  phone,
  consent_health,
  consent_health_at,
  regular_pharmacy_id,
  consent_pharmacist_view,
  consent_pharmacist_view_at,
  font_size,
  alarm_enabled,
  alarm_times,
  regular_pharmacy_name,
  regular_pharmacy_phone,
  regular_pharmacy_address
) ON public.profiles TO authenticated;

-- 행 생성은 handle_new_user()(SECURITY DEFINER, auth.users 트리거)가 담당하므로
-- authenticated INSERT 는 불필요하다.
