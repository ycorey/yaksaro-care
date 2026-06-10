-- 한국어 약품명 부분 문자열 검색 속도 개선
-- ilike '%q%' 는 B-tree로 커버 불가 → GIN trigram 필요

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- drugs: 활성 약품 이름 trigram (OTC/처방약 검색)
CREATE INDEX IF NOT EXISTS idx_drugs_item_name_trgm
  ON public.drugs USING GIN (item_name gin_trgm_ops)
  WHERE is_canceled = false;

-- supplements: 건강기능식품 이름 trigram
CREATE INDEX IF NOT EXISTS idx_supplements_product_name_trgm
  ON public.supplements USING GIN (product_name gin_trgm_ops);
