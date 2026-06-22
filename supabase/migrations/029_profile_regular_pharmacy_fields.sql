-- ─────────────────────────────────────────────
-- profiles: 검색으로 등록한 단골약국(자유텍스트)
-- ─────────────────────────────────────────────
-- 배경: 단골약국을 QR 외에 "이름·지역 검색"으로도 등록하게 한다. 그러나 pharmacies는
--   owner_id NOT NULL인 B2B 약국 전용 테이블이라 검색한 미등록 약국을 넣을 수 없다.
--   → 검색 등록 약국은 환자 프로필에 자유텍스트로 보관(표시·전화용). B2B(QR) 연결은
--   기존 profiles.regular_pharmacy_id(FK)로 유지하여 약사 read-only 조회 게이트와 분리.
-- 표시 규칙: 단골약국명 = regular_pharmacy(FK).name ?? regular_pharmacy_name(텍스트).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS regular_pharmacy_name text,
  ADD COLUMN IF NOT EXISTS regular_pharmacy_phone text,
  ADD COLUMN IF NOT EXISTS regular_pharmacy_address text;
