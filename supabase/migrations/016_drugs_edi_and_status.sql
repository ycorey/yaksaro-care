-- 016_drugs_edi_and_status.sql
-- 약 마스터 확장(허가정보 ~43k) 대비:
--  · edi_code: 보험코드(EDI). 허가정보가 제공. 심평원 DUR CSV(병용금기)와 매칭하는 브릿지 +
--    OCR 보험코드 인식에도 활용. 한 품목에 복수 코드가 콤마로 올 수 있어 text로 보관.
--  · is_canceled: 허가취하/취소 여부. 검색은 정상 품목만 노출하도록 필터에 사용.
ALTER TABLE public.drugs
  ADD COLUMN IF NOT EXISTS edi_code    text,
  ADD COLUMN IF NOT EXISTS is_canceled boolean NOT NULL DEFAULT false;

-- 검색 자동완성이 정상 품목만 빠르게 거르도록(취소품목 제외) partial 인덱스
CREATE INDEX IF NOT EXISTS idx_drugs_active_name
  ON public.drugs(item_name) WHERE is_canceled = false;
