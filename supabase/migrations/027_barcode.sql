-- ─────────────────────────────────────────────
-- drugs/supplements: 상품 바코드(GS1 EAN-13) 컬럼
-- ─────────────────────────────────────────────
-- 배경: OTC·건기식을 이름 검색 대신 박스 바코드 스캔으로 약 지갑에 담기 위함.
--   바코드로 정확히 식별하면 custom_name이 아닌 drug_id/supplement_id로 저장되어
--   DUR·건기식-약물 상호작용 shadow 엔진에 그대로 투입된다.
-- 값:
--   drugs.barcode       = 의약품 표준코드(KD코드, 13자리 GTIN). 심평원 약가마스터로
--                         표준코드↔EDI보험코드 매핑 → drugs.edi_code 브릿지로 적재.
--   supplements.barcode = GS1 유통표준코드(EAN-13). 식약처 유통바코드 공개데이터를
--                         제품명 매칭으로 적재(부분 커버, 미식별은 검색 폴백).
-- 적재: scripts/etl-drug-barcode.mjs · scripts/etl-supplement-barcode.mjs
-- 조회: /api/drugs/search?barcode=<digits>

ALTER TABLE public.drugs       ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE public.supplements ADD COLUMN IF NOT EXISTS barcode text;

-- 스캔 조회는 barcode 단건 lookup → partial index(값 있는 행만, 저장공간 절약)
CREATE INDEX IF NOT EXISTS idx_drugs_barcode
  ON public.drugs (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplements_barcode
  ON public.supplements (barcode) WHERE barcode IS NOT NULL;
