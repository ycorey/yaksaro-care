-- 067: 낱알식별 정보 (MdcinGrnIdntfcInfoService03 전량 적재 대상)
-- 모양·색·각인으로 약을 찾아 등록하는 신규 입구의 검색 원천.
-- 접근 모델은 참조 테이블 관례(001 drugs/interactions): authenticated SELECT 정책만,
-- 쓰기 정책 없음 → 적재는 ETL(service_role, scripts/etl-pill-identification.mjs)만.
-- 이미지: 식약처 원본 URL 저장만. Storage 복사는 이번 범위 제외.
-- TODO: image_url 을 Supabase Storage 로 복사해 원본 링크 사망에 대비 (별도 작업)

create table if not exists public.drug_identification (
  item_seq       text primary key,
  print_front    text,             -- 각인(앞)
  print_back     text,             -- 각인(뒤)
  drug_shape     text,             -- 모양 (원형·타원형·장방형 …)
  color_class1   text,             -- 색(앞)
  color_class2   text,             -- 색(뒤)
  line_front     text,             -- 분할선(앞)
  line_back      text,             -- 분할선(뒤)
  leng_long      numeric,          -- 장축(mm)
  leng_short     numeric,          -- 단축(mm)
  thick          numeric,          -- 두께(mm)
  form_code_name text,             -- 제형
  image_url      text,             -- 낱알 이미지(식약처 원본)
  updated_at     timestamptz not null default now()
);

-- 모양+색 필터가 1차 진입 조건
create index if not exists idx_drug_ident_shape_color on public.drug_identification (drug_shape, color_class1);
-- 각인 부분일치(ILIKE '%…%')용 — pg_trgm 은 022 에서 이미 활성
create index if not exists idx_drug_ident_print_trgm on public.drug_identification
  using gin ((coalesce(print_front, '') || ' ' || coalesce(print_back, '')) gin_trgm_ops);

alter table public.drug_identification enable row level security;

drop policy if exists drug_identification_read on public.drug_identification;
create policy drug_identification_read on public.drug_identification
  for select using (auth.role() = 'authenticated');
