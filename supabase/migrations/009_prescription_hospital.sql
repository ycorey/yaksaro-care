-- 009_prescription_hospital.sql
-- 처방전 발급 병원 정보. 처방전에 인쇄된 병원명 + 요양기관기호를 그대로 저장한다.
-- (의사명·면허번호는 개인정보라 수집하지 않음)

ALTER TABLE public.user_prescriptions
  ADD COLUMN IF NOT EXISTS hospital_name    text,
  ADD COLUMN IF NOT EXISTS institution_code text;  -- 요양기관기호 (8자리)
