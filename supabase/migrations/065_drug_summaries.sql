-- 065: e약은요(DrbEasyDrugInfoService) 응답 DB 캐시
-- /api/drugs/info 가 매 요청 외부 API 를 부르던 것을 item_seq 기준 30일 캐시로 줄인다.
-- 접근 모델은 pubmed_cache(025)와 동일: RLS deny-all + REVOKE, 읽기·쓰기 모두 service_role(admin 클라이언트)만.
-- drugs.item_seq FK 는 걸지 않는다 — e약은요에는 있는데 drugs 마스터에 없는 item_seq 가 존재할 수 있고,
-- 캐시는 참조 무결성보다 가용성이 우선이다(미스 시 조용히 빈 상태가 계약).

create table if not exists public.drug_summaries (
  item_seq    text primary key,
  efficacy    text,          -- efcyQesitm 효능·효과
  usage       text,          -- useMethodQesitm 사용법
  caution     text,          -- atpnQesitm 주의사항
  interaction text,          -- intrcQesitm 상호작용
  side_effect text,          -- seQesitm 부작용
  storage     text,          -- depositMethodQesitm 보관법
  fetched_at  timestamptz not null default now()
);

alter table public.drug_summaries enable row level security;
-- 정책 0개 = deny-all. 벨트&서스펜더로 테이블 권한도 회수(046 관례).
revoke all on table public.drug_summaries from anon, authenticated;
