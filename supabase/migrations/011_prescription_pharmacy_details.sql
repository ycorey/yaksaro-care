-- 011_prescription_pharmacy_details.sql
-- 심평원 요양기관 API로 조회한 조제약국 상세정보(주소·전화·위치)를 처방전에 저장.

ALTER TABLE public.user_prescriptions
  ADD COLUMN IF NOT EXISTS pharmacy_address TEXT,
  ADD COLUMN IF NOT EXISTS pharmacy_phone   TEXT,
  ADD COLUMN IF NOT EXISTS pharmacy_lat     NUMERIC,
  ADD COLUMN IF NOT EXISTS pharmacy_lng     NUMERIC;
