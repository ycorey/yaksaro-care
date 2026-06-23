-- 질환별 생활습관 "일반 정보" 콘텐츠 (질환 단위, 사용자 무관 — 전역 참조 데이터).
--
-- 생성: scripts/gen-lifestyle-content.mjs 가 PubMed 근거 + Claude 요약(safety-frame 시스템 프롬프트)으로
--   질환×토픽별 본문을 만들어 admin(service_role)으로 upsert. 사용자 화면은 순수 SELECT(런타임 LLM 0).
-- 안전: 표시 직전 앱이 passesSafetyFrame()으로 한 번 더 검증(최종 게이트). 본 테이블은 군 단위 일반 정보만.

create table if not exists public.lifestyle_content (
  disease    text        not null,                       -- '당뇨' | '고혈압' | '고지혈증'
  topic      text        not null,                       -- '식단' | '운동' | '생활습관'
  body_ko    text        not null,                       -- 군 단위 일반 정보(개인 진단·지시 없음)
  sources    jsonb       not null default '[]'::jsonb,    -- [{pmid,url,title}]
  updated_at timestamptz not null default now(),
  primary key (disease, topic)
);

alter table public.lifestyle_content enable row level security;

-- 로그인 사용자는 읽기 허용(전역 참조). 쓰기 정책 없음 → service_role(생성 스크립트)만 upsert.
drop policy if exists "lifestyle_content_read" on public.lifestyle_content;
create policy "lifestyle_content_read" on public.lifestyle_content
  for select using (auth.uid() is not null);
