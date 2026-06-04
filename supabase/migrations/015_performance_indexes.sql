-- 015_performance_indexes.sql
-- 성능: 자주 where/join 되는 FK에 인덱스. user_medications는 사용자별로 대량 조회되는
-- 핵심 테이블(약지갑·오늘복약·캘린더의 기본 쿼리). 모두 IF NOT EXISTS(재실행 안전),
-- nullable FK는 partial index로 인덱스 크기·쓰기비용 최소화.

-- 사용자별 "활성" 복약 조회 — 대부분의 쿼리가 user_id 필터 + deleted_at IS NULL.
-- 활성 행만 담는 partial index가 가장 효과적이다.
CREATE INDEX IF NOT EXISTS idx_user_medications_user_active
  ON public.user_medications(user_id) WHERE deleted_at IS NULL;

-- 처방전(그룹)별 복약 조회
CREATE INDEX IF NOT EXISTS idx_user_medications_prescription
  ON public.user_medications(prescription_id) WHERE prescription_id IS NOT NULL;

-- 약/영양제 마스터 조인
CREATE INDEX IF NOT EXISTS idx_user_medications_drug
  ON public.user_medications(drug_id) WHERE drug_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_medications_supplement
  ON public.user_medications(supplement_id) WHERE supplement_id IS NOT NULL;

-- 약사 모드 단골 환자 조회 + 설정의 단골약국 조인(profiles → pharmacies)
CREATE INDEX IF NOT EXISTS idx_profiles_regular_pharmacy
  ON public.profiles(regular_pharmacy_id) WHERE regular_pharmacy_id IS NOT NULL;
