-- 008_drugs_image_url.sql
-- 약 이미지 URL 캐시. 실버세대는 약을 이름이 아니라 '모양'으로 기억하므로
-- 약 지갑/처방전 결과에 약 사진을 노출한다. 이미지 출처는 의약품 허가정보 API(BIG_PRDT_IMG_URL).
-- /api/drugs/info 가 이미지 조회에 성공하면 item_seq 기준으로 이 컬럼에 lazy-cache 한다.

ALTER TABLE public.drugs
  ADD COLUMN IF NOT EXISTS image_url text;
