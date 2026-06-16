-- 025_pubmed_cache.sql
-- PubMed 근거 수집 캐시 (약사로케어 상호작용 체커 + 블로그 "vs" 비교 포스트 공용)
--
-- 핵심 계율:
--  · PubMed(NCBI E-utilities) + Claude 요약은 호출 비용이 있어 query-key 단위로 30일 캐싱.
--  · 전역 캐시(특정 사용자 소유 아님) → service_role(admin client)만 read/write.
--    anon/authenticated 정책을 두지 않아(deny-all) 클라이언트 직접 접근을 차단한다.
--  · query_key = 정규화 검색어(소문자·trim·연속공백 1칸). 동일 검색어는 캐시 1행으로 수렴.

create table if not exists public.pubmed_cache (
  id           uuid        primary key default gen_random_uuid(),
  query_key    text        not null unique,            -- 정규화 검색어
  raw_results  jsonb       not null,                   -- PubMed 파싱 결과 배열
  summary_ko   text,                                   -- Claude 한국어 요약(JSON 문자열 or 텍스트)
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '30 days')
);

-- 캐시 히트 조회는 query_key(unique 제약으로 인덱스 자동) + expires_at 만료 필터.
-- 만료 청소/정렬용 인덱스.
create index if not exists idx_pubmed_cache_expires
  on public.pubmed_cache(expires_at);

-- RLS: 활성화하되 정책은 두지 않는다(deny-all). service_role은 RLS를 우회하므로
-- 서버의 admin client만 접근 가능. 클라이언트(anon/authenticated)는 전면 차단.
alter table public.pubmed_cache enable row level security;
