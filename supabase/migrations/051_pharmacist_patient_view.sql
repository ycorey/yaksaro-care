-- 051: 약사가 보는 환자 프로필을 필요한 컬럼으로 좁힌다
--
-- 배경: profiles_pharmacist_view 는 RLS **행** 정책이라 통과하면 그 행의 모든 컬럼이 열린다.
-- 약사에게 열려 있던 것: email · phone · consent_health · font_size · alarm_enabled ·
-- alarm_times · regular_pharmacy_name/phone/address. 정책 주석은 "환자 이름·연락 등 식별"을
-- 의도한다고 적혀 있어 의도와 구현이 어긋나 있었다(개인정보 최소수집 원칙).
--
-- 컬럼 단위 GRANT 로는 해결할 수 없다 — 약사도 환자도 같은 `authenticated` 롤이라
-- 롤 단위로 컬럼을 나누면 환자 본인의 설정 화면(font_size·alarm_times)까지 막힌다.
-- 따라서 게이트를 담은 뷰를 만들고, 행 정책은 제거해 약사의 profiles 직접 조회를 닫는다.
--
-- 이 뷰는 소유자(postgres) 권한으로 실행돼 RLS 를 우회하지만, WHERE 절의
-- pharmacist_can_view(id) 가 동일한 게이트(단골 관계 AND 명시적 동의)를 그대로 적용한다.
-- Supabase advisor 의 security_definer_view 경고는 이 설계의 의도된 결과다.

-- security_barrier: 이 뷰는 소유자 권한으로 실행되므로, 호출자가 넣은 조건이
-- 게이트(pharmacist_can_view)보다 먼저 평가돼 행 존재 여부가 새는 일을 막는다.
CREATE OR REPLACE VIEW public.pharmacist_patient_view
  WITH (security_barrier = true) AS
  SELECT p.id,
         p.full_name,
         p.consent_pharmacist_view_at
  FROM public.profiles p
  WHERE public.pharmacist_can_view(p.id);

-- 주의: Supabase advisor 는 이 뷰를 security_definer_view(ERROR)로 표시한다. 의도된 결과다.
-- security_invoker=true 로 두면 profiles 의 RLS 가 적용되는데, RLS 정책은 **컬럼을 제한하지
-- 못하므로** 그 경우 약사에게 행 전체를 다시 열어줘야 한다(= 이 마이그레이션의 목적이 무산).
-- 게이트는 기존 정책과 동일한 pharmacist_can_view(단골 관계 AND 명시적 동의)이며,
-- e2e/pharmacist-rls-qa 가 ① 동의 시 1건 ② 미동의·타약국 0건 ③ profiles 직접조회 0건
-- ④ 노출 컬럼 3개를 매 실행마다 검증한다.

-- 환자 본인은 profiles_self 로 자기 행을 그대로 읽는다. 이 뷰는 약사 전용 **읽기** 통로다.
--
-- ⚠️ authenticated 를 반드시 REVOKE 대상에 포함할 것.
-- Supabase 는 뷰 생성 시 authenticated 에 ALL(arwdDxtm)을 기본 부여하는데,
-- 이 뷰는 단일 테이블·비집계라 **auto-updatable** 이고 정의자 권한으로 실행된다.
-- 즉 REVOKE 에서 authenticated 를 빠뜨리면 뒤이은 GRANT SELECT 가 아무것도 좁히지 못하고,
-- 약사가 DELETE /rest/v1/pharmacist_patient_view?id=eq.<환자> 로 환자 profiles 행을
-- 통째로 지울 수 있다(RLS·컬럼 GRANT 를 둘 다 우회). "약사는 read-only" 계율 위반.
REVOKE ALL ON public.pharmacist_patient_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pharmacist_patient_view TO authenticated;

-- 행 전체를 열던 정책 제거 → 약사는 이제 profiles 를 직접 조회할 수 없다.
DROP POLICY IF EXISTS "profiles_pharmacist_view" ON public.profiles;
