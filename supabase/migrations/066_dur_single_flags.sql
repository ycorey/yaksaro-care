-- 066: DUR 단일 약 속성 플래그 — 노인주의·효능군중복
-- interactions(병용금기)는 약 "쌍" 모델이라 단일 약 속성(노인주의)·효능군 소속(중복 판정 재료)을
-- 담을 자리가 없다 → 별도 테이블. 중복 여부 판정은 저장하지 않는다 — 같은 group_code 약이
-- 현재 등록에 2개 이상인지는 조회 시점의 사실이므로 앱(src/lib/dur-flags.ts)이 계산한다.
-- 접근 모델은 drugs/interactions 참조 테이블 관례(001): authenticated SELECT 정책만,
-- 쓰기 정책 없음 → 적재는 ETL(service_role, scripts/etl-dur-flags.mjs)만.

create table if not exists public.dur_single_flags (
  id          uuid primary key default gen_random_uuid(),
  item_seq    text not null,
  flag_type   text not null check (flag_type in ('elderly_caution', 'efficacy_duplicate_group')),
  group_code  text not null default '',   -- 효능군중복: EFFECT_NAME(효능군명). 노인주의: ''
  description text,                        -- PROHBT_CONTENT(식약처 원문)
  source      text not null default 'dur_api',
  updated_at  timestamptz not null default now(),
  unique (item_seq, flag_type, group_code)  -- ETL upsert onConflict 대상
);

create index if not exists idx_dur_single_flags_item on public.dur_single_flags (item_seq);

alter table public.dur_single_flags enable row level security;

drop policy if exists dur_single_flags_read on public.dur_single_flags;
create policy dur_single_flags_read on public.dur_single_flags
  for select using (auth.role() = 'authenticated');
