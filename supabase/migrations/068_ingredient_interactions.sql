-- 068: 성분 단위 상호작용 규칙 — 제품쌍(interactions)에서 성분쌍으로 저장 모델 전환
--
-- 왜: interactions(제품쌍 305,005)가 닿는 약은 8,065품목(정상 약의 22.9%)뿐이다. 원인은 데이터가
-- 아니라 자료구조다 — 기존 ETL 이 drugs.ingredient_code(스칼라)에 성분을 약당 1개만 넣어,
-- 복합제 11,004건(정상 약의 31.2%, 평균 4.39성분)의 성분 대부분이 판정에서 빠진다.
-- 같은 규칙을 성분 단위로 접으면 1,806쌍이 되고, 그 성분들이 닿는 약은 14,583(41.3%)이다(실측).
--
-- 왜 제품쌍을 전개하지 않는가: 성분 규칙이 함의하는 제품쌍은 2,664,934(현재의 8.74배, 실측).
-- 저장이 불가능한 규모는 아니지만, 전개하면 (a) "어느 성분 때문인지"를 화면에 말할 수 없고
-- (b) 규칙 하나 고칠 때마다 수백만 행을 다시 써야 한다. 사실(성분쌍)을 저장하고 제품 매칭은
-- 조회 시점에 조인한다 — 066 이 효능군중복에 쓴 것과 같은 원칙이다.
--
-- 접근 모델은 drugs/interactions/dur_single_flags 참조 테이블 관례(001·066):
-- authenticated SELECT 정책만, 쓰기 정책 없음 → 적재는 ETL(service_role)만.
--
-- ⚠️ 이 마이그레이션 적용 시점부터 interactions 는 **동결**이다. 어떤 ETL 도 거기에 쓰지 않는다
--    (etl-dur-ingredient.mjs 의 제품 교차곱 164–186행 제거, etl-dur-from-csv.mjs 는 출력처를
--     ingredient_interactions 로 재작성). 동결 시점의 행 수가 회귀 대조 기준선이다.

-- ── 성분명 → 정규화 키 매핑 ────────────────────────────────────────────
-- name_en 을 PK 로 둔다(성분 위치 91,507행이 아니라 고유 이름 4,370행만 유지).
-- norm_key 는 src/lib/ingredient-key.ts 의 가변 규칙에서 파생된 값이라 성분 위치마다 굳히지
-- 않는다 — 규칙이 바뀌면 이 표만 다시 쓰면 되고, rule_version 으로 되돌린다.
create table if not exists public.ingredient_norms (
  name_en       text primary key,           -- drug_ingredients.name_en 원문(조인 키)
  norm_key      text not null,              -- ingredientKey(name_en)
  display_ko    text,                       -- 한글 표시명(있을 때만)
  dur_ingr_code text,                       -- 식약처 INGR_CODE(대조·추적용, 판정에는 안 씀)
  rule_version  text not null default 'v1', -- 정규화 규칙 판(롤백 단위)
  source        text not null default 'etl',
  updated_at    timestamptz not null default now()
);

create index if not exists idx_ingredient_norms_key on public.ingredient_norms (norm_key);

-- ── 성분쌍 상호작용 규칙 ──────────────────────────────────────────────
-- 항상 norm_key_a < norm_key_b 로 정렬해 저장한다(interactions 의 a<b 관례 승계) —
-- 정렬하지 않으면 같은 쌍이 두 행으로 들어와 조회가 중복을 뱉는다.
create table if not exists public.ingredient_interactions (
  id              uuid primary key default gen_random_uuid(),
  norm_key_a      text not null,
  norm_key_b      text not null,
  dur_ingr_code_a text,
  dur_ingr_code_b text,
  description     text,                      -- PROHBT_CONTENT 정제본(금기 사유. 투여 지시는 절단)
  source          text not null default 'dur_api',  -- dur_api | hira_csv
  updated_at      timestamptz not null default now(),
  constraint ingredient_interactions_ordered check (norm_key_a < norm_key_b),
  unique (norm_key_a, norm_key_b)
);

create index if not exists idx_ingredient_interactions_a on public.ingredient_interactions (norm_key_a);
create index if not exists idx_ingredient_interactions_b on public.ingredient_interactions (norm_key_b);

-- ── RLS ───────────────────────────────────────────────────────────────
alter table public.ingredient_norms        enable row level security;
alter table public.ingredient_interactions enable row level security;

drop policy if exists ingredient_norms_read on public.ingredient_norms;
create policy ingredient_norms_read on public.ingredient_norms
  for select using (auth.role() = 'authenticated');

drop policy if exists ingredient_interactions_read on public.ingredient_interactions;
create policy ingredient_interactions_read on public.ingredient_interactions
  for select using (auth.role() = 'authenticated');
