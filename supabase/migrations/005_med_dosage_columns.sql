-- 005_med_dosage_columns.sql
-- user_medications 에 처방전 용법(1회투약량·1일투여횟수·총투약일수) 구조화 컬럼 추가.
-- 기존 dose/frequency(text)는 수동 입력용으로 유지하고, OCR은 아래 숫자 컬럼에 저장한다.

ALTER TABLE public.user_medications
  ADD COLUMN IF NOT EXISTS dose_amount   numeric,  -- 1회 투약량
  ADD COLUMN IF NOT EXISTS doses_per_day integer,  -- 1일 투여횟수
  ADD COLUMN IF NOT EXISTS total_days    integer,  -- 총 투약일수
  ADD COLUMN IF NOT EXISTS ingredient    text;     -- 주성분명 (e약은요 효능 조회용)
