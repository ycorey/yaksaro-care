-- 052: 랜딩 대기자 폼 입력 제약 + 죽은 레거시 테이블 무력화

-- ── 1) waitlist: 익명 INSERT 남용 완화 ──────────────────────────────────────
-- 랜딩 폼은 anon 이 직접 INSERT 한다(정상 설계 — 읽기 정책은 없어 명단 유출은 불가).
-- 다만 길이·형식 제한이 없어 컬럼당 수 MB 문자열이나 임의 대량 삽입이 가능했다.
-- 유일한 방어선이던 email UNIQUE 는 중복만 막을 뿐 신규 임의 주소를 막지 못한다.
--
-- 클라이언트 검증(maxlength)은 우회 가능하므로 DB 레벨에 건다.
-- 적용 시점 데이터: 1행, 최대 길이 16, 형식 위반 0 → 기존 데이터가 제약에 걸리지 않는다.
ALTER TABLE public.waitlist
  DROP CONSTRAINT IF EXISTS waitlist_email_sane;
ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_email_sane
  CHECK (length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- source 도 자유 문자열이라 함께 제한(현재는 'landing' 고정)
ALTER TABLE public.waitlist
  DROP CONSTRAINT IF EXISTS waitlist_source_len;
ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_source_len
  CHECK (source IS NULL OR length(source) <= 64);

-- ── 2) 죽은 레거시 테이블 무력화 ────────────────────────────────────────────
-- prescriptions · pharmacy_patients 는 베이스 스키마(001)의 잔재로 현재
-- **0행 · 코드 참조 0건**이다. 그런데 둘 다 `FOR ALL` 정책을 들고 있다.
-- 특히 pharmacy_patients_patient 는 환자가 **임의 약국에 자기를 연결하는 INSERT** 를
-- 허용하는데, 이는 046 에서 Critical 이었던 pharmacies_owner 의 `FOR ALL` 과 같은 구조다.
-- 지금은 데이터도 코드 경로도 없어 악용 불가지만, 나중에 이 테이블을 다시 쓰기 시작하면
-- 그대로 구멍이 된다.
--
-- 테이블 DROP 은 되돌릴 수 없으므로 여기서는 **정책·권한만 제거해 무력화**한다.
-- (RLS 활성 + 정책 0개 = deny-all). 완전 제거를 원하면 별도로:
--   DROP TABLE public.pharmacy_patients; DROP TABLE public.prescriptions;
DROP POLICY IF EXISTS "prescriptions_self"          ON public.prescriptions;
DROP POLICY IF EXISTS "pharmacy_patients_patient"   ON public.pharmacy_patients;
DROP POLICY IF EXISTS "pharmacy_patients_pharmacy"  ON public.pharmacy_patients;

REVOKE ALL ON TABLE public.prescriptions     FROM anon, authenticated;
REVOKE ALL ON TABLE public.pharmacy_patients FROM anon, authenticated;

COMMENT ON TABLE public.prescriptions IS
  '레거시(미사용, 0행). user_prescriptions 가 현행. 052 에서 정책·권한 제거로 무력화.';
COMMENT ON TABLE public.pharmacy_patients IS
  '레거시(미사용, 0행). 단골 관계는 profiles.regular_pharmacy_id 가 현행. 052 에서 무력화.';
