-- 023_drop_duplicate_indexes.sql
-- 001 베이스 스키마 역덤프 과정에서 발견된 완전 중복 인덱스 제거.
-- 베이스 인덱스(001에 편입)와 동일 정의를 015/022가 다른 이름으로 재생성했다.
--   idx_supplements_product_name_trgm(022) == idx_supplements_name(001)        : gin(product_name gin_trgm_ops)
--   idx_user_medications_user_active(015)  == idx_user_meds_user(001)          : btree(user_id) WHERE deleted_at IS NULL
-- 베이스 이름을 정본으로 유지하고 중복본을 제거한다. (쓰기 오버헤드·스토리지 절감)

DROP INDEX IF EXISTS public.idx_supplements_product_name_trgm;
DROP INDEX IF EXISTS public.idx_user_medications_user_active;
