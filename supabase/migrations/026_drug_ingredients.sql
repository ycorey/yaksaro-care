-- ─────────────────────────────────────────────
-- drug_ingredients: 약품별 성분 구조화 테이블
-- ─────────────────────────────────────────────
-- 배경: 기존 drugs.ingredient_name 은 허가정보 ITEM_INGR_NAME 단일 문자열
--   (영문·슬래시 나열·중복 포함, 예: 다제스 21개 중 실제 7종)이라
--   성분 표시/검색에서 누락·중복·오인이 발생함.
-- 해결: 성분을 행 단위로 분해 저장 → 정확 표시 + 성분명 검색 가능.
--   name_ko/ingredient_code 는 DUR 성분 + 표준 매핑으로 enrich(부분).
--   amount/unit 은 식약처 상세/주성분 API 등록 후 채움(완전판).
-- 적재: scripts/etl-ingredients.mjs

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.drug_ingredients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_id         uuid NOT NULL REFERENCES public.drugs(id) ON DELETE CASCADE,
  position        int  NOT NULL DEFAULT 0,
  name_en         text NOT NULL,
  name_ko         text,
  ingredient_code text,
  amount          text,            -- 분량 (상세 API 등록 후 채움)
  unit            text,            -- 단위 (상세 API 등록 후 채움)
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (drug_id, name_en)
);

ALTER TABLE public.drug_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drug_ingredients_read" ON public.drug_ingredients;
CREATE POLICY "drug_ingredients_read" ON public.drug_ingredients
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_drug_ingredients_drug_id
  ON public.drug_ingredients (drug_id);
CREATE INDEX IF NOT EXISTS idx_drug_ingredients_name_ko_trgm
  ON public.drug_ingredients USING GIN (name_ko gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_drug_ingredients_name_en_trgm
  ON public.drug_ingredients USING GIN (name_en gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_drug_ingredients_code
  ON public.drug_ingredients (ingredient_code);
