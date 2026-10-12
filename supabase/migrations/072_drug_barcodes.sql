-- 072: 의약품 바코드 1:N 테이블 — 027 의 drugs.barcode(대표 1개) 를 승급한다.
--
-- 왜: 027 + scripts/etl-drug-barcode.mjs(v1) 는 약가마스터 CSV 를 EDI 보험코드로 drugs 에 이었다.
--     비급여 일반약은 EDI 가 없어 대부분 빠졌고(일반약 13.3%), 포장 단위별 바코드 중 1개만 남겼다.
--     연결 키를 **품목기준코드(= item_seq)** 로 바꾸면 2026-10-12 실측(약가마스터 2026-08-31판):
--       drugs 일반약 정상 8,678 중 8,231 (94.8%) · 바코드 58,163개 · 품목 간 충돌 0
--
-- 설계:
--   · barcode PK — 한 바코드는 한 품목에만 걸린다(충돌 0 실측). 조회는 이 PK 단건 lookup.
--   · drugs 에 **FK 를 걸지 않는다.** CSV 에만 있는 일반약 5,687품목은 drugs 에 아직 없고,
--     스캔 시 resolveDrugIdByItemSeq(src/lib/drug-master.ts) 가 허가정보로 만든다.
--     바코드는 조회 키일 뿐 약 정보는 여기 두지 않는다.
--   · 1차 적재는 일반의약품만(ETL 이 거른다). 건기식은 약가마스터에 없다.
--   · 027 의 drugs.barcode 컬럼은 읽는 코드가 없어진 뒤 후속 마이그레이션에서 지운다.
--
-- 권한: 2026-10-30 부터 public 새 테이블에 자동 GRANT 가 없다 → 여기서 명시한다.
--   읽기: /api/drugs/search?barcode= 가 사용자 세션 클라이언트로 읽는다(authenticated SELECT).
--   쓰기: ETL(service_role) 만. 공공데이터라 노출 위험은 없지만 쓰기 정책은 두지 않는다.
--
-- 적용: Supabase SQL Editor 에서 직접 실행(이 저장소 관례) → 그 다음 `npm run etl:drug-barcode -- <csv>`.
-- 롤백: drop table public.drug_barcodes;  (코드는 빈 결과 → 이름 검색 폴백으로 동작)

create table if not exists public.drug_barcodes (
  barcode    text primary key check (barcode ~ '^\d{13}$'),
  item_seq   text not null    check (item_seq ~ '^\d{9}$'),
  source     text not null default 'hira_master',
  updated_at timestamptz not null default now()
);

-- 품목 → 바코드 역조회(포장 단위 목록·재적재 정리)용
create index if not exists idx_drug_barcodes_item_seq on public.drug_barcodes (item_seq);

alter table public.drug_barcodes enable row level security;

drop policy if exists "drug_barcodes_read" on public.drug_barcodes;
create policy "drug_barcodes_read" on public.drug_barcodes
  for select to authenticated using (true);

revoke all on public.drug_barcodes from anon;
grant select on public.drug_barcodes to authenticated;
grant all    on public.drug_barcodes to service_role;

comment on table public.drug_barcodes is
  '의약품 표준코드(박스 바코드 13자리) → 품목기준코드. 약가마스터(공공데이터 15067462) 기준, scripts/etl-drug-barcode.mjs 적재.';
