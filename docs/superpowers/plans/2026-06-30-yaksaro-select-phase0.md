# 약사로 셀렉트 Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개화약국 약사가 환자 복약을 보고 부족 영양소를 파악해, 상호작용·근거로 안전한 맞춤 건강기능식품을 추천하고 구매 전환율을 측정하는 도구를 만든다.

**Architecture:** 케어 레포 내 약사 영역 새 라우트 `/pharmacy/select`. 순수 함수 3개(`lib/select/depletion·questionnaire·recommend`)가 복약→갭→문진→추천을 담당하고, 상호작용(`supplement-interaction`)·근거(`evidence-grade`)·OCR은 기존 자산을 주입/재사용. 신규 테이블 3개는 jsonb로 얇게.

**Tech Stack:** Next.js 16.2.6 (App Router) · TypeScript · Supabase(RLS) · vitest(신규, 순수 함수 단위 테스트) · 기존 엔진(MedData·PubMed·Claude)

## Global Constraints

- TypeScript strict — 작업 종료 시 `npx tsc --noEmit` 0 에러, `npm run lint` 0 문제.
- 모든 사용자 노출 생성 문구는 `src/lib/lifestyle-info/safety-frame.ts`의 톤 — **효능 단정·질병 치료 주장 금지**. 건기식=의약품 아님.
- 상호작용·근거·OCR은 **server-only**(MEDDATA_API_KEY·ANTHROPIC_API_KEY·NCBI_API_KEY는 .env.local). 클라이언트 번들에 키·엔진 유입 금지.
- 신규 DB 접근은 **약사 RLS 스코프**(본인 약국 pharmacy_id)만. service_role 우회 금지(상담 데이터는 user 토큰+RLS).
- 마이그레이션은 CLI 없이 Supabase(SQL Editor 또는 MCP `apply_migration`)로 적용. 파일은 `supabase/migrations/`에 버전관리.
- 디자인 토큰/컴포넌트는 `components/yc/*` 재사용(YCCard·SectionHeader 등). 하드코딩 hex 금지.
- 엔진 중복 구현 금지 — 상호작용=`analyzeInteraction`, 근거=`searchGradedEvidence` 재사용.

---

### Task 1: vitest 셋업 (순수 함수 단위 테스트 토대)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts에 `test` 추가, devDependencies에 vitest)
- Create: `src/lib/select/smoke.test.ts` (셋업 검증용, 이후 삭제 가능)

**Interfaces:**
- Produces: `npm run test` 명령(vitest run). 이후 모든 `lib/select/*.test.ts`가 이걸로 돈다.

- [ ] **Step 1: vitest 설치**

Run: `npm install -D vitest@^3`
Expected: package.json devDependencies에 vitest 추가.

- [ ] **Step 2: vitest.config.ts 작성**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
```

- [ ] **Step 3: package.json에 test 스크립트 추가**

`"scripts"`에 추가:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 스모크 테스트 작성**

`src/lib/select/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
describe('vitest 셋업', () => {
  it('동작한다', () => { expect(1 + 1).toBe(2) })
})
```

- [ ] **Step 5: 실행해서 통과 확인**

Run: `npm run test`
Expected: 1 passed.

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/select/smoke.test.ts
git commit -m "test: vitest 셋업 (lib/select 단위 테스트 토대)"
```

---

### Task 2: 마이그레이션 041 — 테이블 3개 + RLS + 시드

**Files:**
- Create: `supabase/migrations/041_select_phase0.sql`

**Interfaces:**
- Produces: 테이블 `nutrient_depletion`, `supplement_catalog`, `select_consultations`. 컬럼·타입은 아래 SQL이 정본.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/041_select_phase0.sql`:
```sql
-- 약사로 셀렉트 Phase 0: 고갈 지식 + 갭→완제품 + 상담 세션

-- 1) 약물성 영양소 고갈 지식 (약사 큐레이션). 영양소 1개 = 1행.
create table if not exists public.nutrient_depletion (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  match_keywords text[] not null,           -- 복약 성분/약명에 부분일치(소문자)
  nutrient_ko text not null,
  nutrient_en text not null,
  severity text not null check (severity in ('high','moderate','low')),
  mechanism_ko text not null,
  evidence_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.nutrient_depletion enable row level security;
create policy "depletion read for authenticated" on public.nutrient_depletion
  for select to authenticated using (true);

-- 2) 갭(영양소) → 약국 취급 완제품
create table if not exists public.supplement_catalog (
  id uuid primary key default gen_random_uuid(),
  nutrient_en text not null,
  product_name_ko text not null,
  form text not null,
  typical_dose_ko text not null,
  ingredient_en text not null,              -- 상호작용/근거 검색 투입용
  interaction_query_ko text,                -- analyzeInteraction용 ko명(없으면 product 사용)
  supplement_id bigint,
  cautions_ko text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_catalog_nutrient on public.supplement_catalog (nutrient_en) where active;
alter table public.supplement_catalog enable row level security;
create policy "catalog read for authenticated" on public.supplement_catalog
  for select to authenticated using (true);

-- 3) 상담 세션 + 결과(전환율)
create table if not exists public.select_consultations (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  patient_label text,
  meds jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  survey jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  purchased jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','confirmed','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_consult_pharmacy on public.select_consultations (pharmacy_id, created_at desc);
alter table public.select_consultations enable row level security;
-- 약사 본인 약국 범위만. pharmacies.owner_id = 현재 약사.
create policy "consult rw for owning pharmacist" on public.select_consultations
  for all to authenticated
  using (exists (select 1 from public.pharmacies p where p.id = pharmacy_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.pharmacies p where p.id = pharmacy_id and p.owner_id = auth.uid()));

-- 시드: 확립된 약물성 영양소 고갈 (~20)
insert into public.nutrient_depletion (label, match_keywords, nutrient_ko, nutrient_en, severity, mechanism_ko, evidence_note) values
('메트포르민 → 비타민 B12', array['metformin'], '비타민 B12', 'Vitamin B12', 'high', '장에서 비타민 B12 흡수를 줄이는 것으로 알려져 있습니다.', 'PMID 27034152 등'),
('스타틴 → 코엔자임Q10', array['statin','atorvastatin','rosuvastatin','simvastatin','pravastatin','pitavastatin'], '코엔자임Q10', 'Coenzyme Q10', 'moderate', '콜레스테롤 합성 경로를 막아 CoQ10 생성도 함께 줄 수 있습니다.', ''),
('PPI → 비타민 B12', array['prazole','omeprazole','esomeprazole','pantoprazole','lansoprazole','rabeprazole'], '비타민 B12', 'Vitamin B12', 'moderate', '위산을 줄여 비타민 B12 흡수가 감소할 수 있습니다.', ''),
('PPI → 마그네슘', array['prazole','omeprazole','esomeprazole','pantoprazole','lansoprazole','rabeprazole'], '마그네슘', 'Magnesium', 'moderate', '장기 복용 시 마그네슘 흡수가 줄 수 있습니다.', ''),
('루프 이뇨제 → 마그네슘', array['furosemide','torsemide','bumetanide'], '마그네슘', 'Magnesium', 'high', '소변으로 마그네슘 배설이 늘 수 있습니다.', ''),
('루프 이뇨제 → 칼륨', array['furosemide','torsemide','bumetanide'], '칼륨', 'Potassium', 'high', '소변으로 칼륨 배설이 늘 수 있습니다.', ''),
('티아지드 이뇨제 → 마그네슘', array['hydrochlorothiazide','chlorthalidone','indapamide'], '마그네슘', 'Magnesium', 'moderate', '소변으로 마그네슘·아연 배설이 늘 수 있습니다.', ''),
('티아지드 이뇨제 → 아연', array['hydrochlorothiazide','chlorthalidone','indapamide'], '아연', 'Zinc', 'low', '소변으로 아연 배설이 늘 수 있습니다.', ''),
('경구 스테로이드 → 칼슘', array['prednisolone','prednisone','methylprednisolone','dexamethasone'], '칼슘', 'Calcium', 'moderate', '칼슘 흡수 감소·배설 증가와 관련이 있습니다.', ''),
('경구 스테로이드 → 비타민 D', array['prednisolone','prednisone','methylprednisolone','dexamethasone'], '비타민 D', 'Vitamin D', 'moderate', '비타민 D 대사에 영향을 줄 수 있습니다.', ''),
('메토트렉세이트 → 엽산', array['methotrexate'], '엽산', 'Folate', 'high', '엽산 대사를 억제합니다(엽산 보충은 흔히 함께 권장).', ''),
('경구피임약 → 비타민 B6', array['ethinyl estradiol','levonorgestrel','desogestrel','drospirenone'], '비타민 B6', 'Vitamin B6', 'low', '여러 B군 영양소 수치 저하와 관련이 보고됩니다.', ''),
('경구피임약 → 엽산', array['ethinyl estradiol','levonorgestrel','desogestrel','drospirenone'], '엽산', 'Folate', 'low', '엽산 수치 저하와 관련이 보고됩니다.', ''),
('메트포르민 → 엽산', array['metformin'], '엽산', 'Folate', 'low', '엽산 흡수에도 영향을 줄 수 있습니다.', ''),
('와파린 → 비타민 K(주의)', array['warfarin'], '비타민 K', 'Vitamin K', 'high', '비타민 K는 와파린 효과를 약화시킬 수 있어 보충 전 반드시 상담이 필요합니다.', '상호작용 주의 — 보충 권장 아님'),
('아이소니아지드 → 비타민 B6', array['isoniazid'], '비타민 B6', 'Vitamin B6', 'high', '비타민 B6 결핍·신경병증과 관련됩니다.', ''),
('콜레스티라민 → 지용성 비타민', array['cholestyramine','colestipol'], '비타민 D', 'Vitamin D', 'moderate', '지용성 비타민(A·D·E·K) 흡수를 줄일 수 있습니다.', ''),
('하이드랄라진 → 비타민 B6', array['hydralazine'], '비타민 B6', 'Vitamin B6', 'low', '비타민 B6와 결합해 결핍을 유발할 수 있습니다.', ''),
('장기 항생제 → 비타민 K', array['amoxicillin','cephalexin','clindamycin'], '비타민 K', 'Vitamin K', 'low', '장내 세균총 변화로 비타민 K 생성이 줄 수 있습니다.', ''),
('SSRI 장기 → 일반 정보', array['sertraline','escitalopram','fluoxetine','paroxetine'], '마그네슘', 'Magnesium', 'low', '근거는 제한적 — 일반적 보충 정보 수준.', '근거 약함');

-- 시드: 갭→완제품 (개화약국 취급 예시; 실제 취급품으로 교체)
insert into public.supplement_catalog (nutrient_en, product_name_ko, form, typical_dose_ko, ingredient_en, interaction_query_ko, cautions_ko) values
('Vitamin B12', '비타민 B12 1000mcg', '정', '1일 1정', 'cyanocobalamin', '비타민 B12', null),
('Coenzyme Q10', '코엔자임Q10 100mg', '캡슐', '1일 1캡슐', 'coenzyme Q10', '코엔자임Q10', '와파린 복용 시 상담'),
('Magnesium', '마그네슘 350mg', '정', '1일 1정', 'magnesium', '마그네슘', '일부 항생제와 복용간격 필요'),
('Potassium', '칼륨 보충(식이 우선)', '정보', '식이 권장', 'potassium', '칼륨', '신장질환·칼륨보존이뇨제 시 주의'),
('Zinc', '아연 15mg', '정', '1일 1정', 'zinc', '아연', null),
('Calcium', '칼슘 500mg', '정', '1일 1~2정', 'calcium', '칼슘', '일부 약과 복용간격 필요'),
('Vitamin D', '비타민 D 2000IU', '캡슐', '1일 1캡슐', 'vitamin D', '비타민 D', null),
('Folate', '엽산 400mcg', '정', '1일 1정', 'folate', '엽산', null),
('Vitamin B6', '비타민 B6 25mg', '정', '1일 1정', 'pyridoxine', '비타민 B6', null);
```

- [ ] **Step 2: Supabase에 적용**

Supabase MCP `apply_migration`(name=`041_select_phase0`) 또는 SQL Editor에 위 SQL 실행.

- [ ] **Step 3: 적용 검증**

Run (Supabase MCP `execute_sql` 또는 SQL Editor):
```sql
select
  (select count(*) from public.nutrient_depletion) as depletion,
  (select count(*) from public.supplement_catalog) as catalog;
```
Expected: depletion 20, catalog 9.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/041_select_phase0.sql
git commit -m "feat(select): 041 마이그레이션 — 고갈·카탈로그·상담 테이블 + 시드"
```

---

### Task 3: lib/select/types.ts + depletion.ts (복약 → 갭)

**Files:**
- Create: `src/lib/select/types.ts`
- Create: `src/lib/select/depletion.ts`
- Test: `src/lib/select/depletion.test.ts`

**Interfaces:**
- Produces:
  - `type SelectMed = { name: string; ingredient: string; source: 'ocr' | 'manual' }`
  - `type Gap = { nutrient_ko: string; nutrient_en: string; severity: 'high'|'moderate'|'low'; source: 'drug'|'condition'; reason_ko: string }`
  - `type DepletionRule = { id: string; label: string; match_keywords: string[]; nutrient_ko: string; nutrient_en: string; severity: 'high'|'moderate'|'low'; mechanism_ko: string; evidence_note: string | null }`
  - `function analyzeDepletion(meds: SelectMed[], rules: DepletionRule[]): Gap[]`

- [ ] **Step 1: 타입 작성**

`src/lib/select/types.ts`:
```ts
export type SelectMed = { name: string; ingredient: string; source: 'ocr' | 'manual' }

export type GapSeverity = 'high' | 'moderate' | 'low'

export type Gap = {
  nutrient_ko: string
  nutrient_en: string
  severity: GapSeverity
  source: 'drug' | 'condition'
  reason_ko: string
}

export type DepletionRule = {
  id: string
  label: string
  match_keywords: string[]
  nutrient_ko: string
  nutrient_en: string
  severity: GapSeverity
  mechanism_ko: string
  evidence_note: string | null
}

export type Question = {
  id: string
  text_ko: string
  type: 'yesno' | 'choice'
  choices?: string[]
  kind: 'gap' | 'safety'
  nutrient_en?: string
}

export type CatalogItem = {
  id: string
  nutrient_en: string
  product_name_ko: string
  form: string
  typical_dose_ko: string
  ingredient_en: string
  interaction_query_ko: string | null
  cautions_ko: string | null
}

export type RecItem = {
  product_name_ko: string
  nutrient_ko: string
  evidence_grade: 'A' | 'B' | 'C' | null
  evidence_summary_ko: string
  interaction_status: 'safe' | 'caution' | 'blocked'
  interaction_note_ko: string
  dose_note_ko: string
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/select/depletion.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { analyzeDepletion } from './depletion'
import type { DepletionRule, SelectMed } from './types'

const rules: DepletionRule[] = [
  { id: '1', label: '메트포르민→B12', match_keywords: ['metformin'], nutrient_ko: '비타민 B12', nutrient_en: 'Vitamin B12', severity: 'high', mechanism_ko: '흡수 감소', evidence_note: null },
  { id: '2', label: 'PPI→B12', match_keywords: ['prazole', 'omeprazole'], nutrient_ko: '비타민 B12', nutrient_en: 'Vitamin B12', severity: 'moderate', mechanism_ko: '위산 감소', evidence_note: null },
  { id: '3', label: 'PPI→Mg', match_keywords: ['prazole'], nutrient_ko: '마그네슘', nutrient_en: 'Magnesium', severity: 'low', mechanism_ko: '흡수 감소', evidence_note: null },
]

describe('analyzeDepletion', () => {
  it('성분 키워드로 갭을 찾는다', () => {
    const meds: SelectMed[] = [{ name: '다이아벡스', ingredient: 'Metformin HCl', source: 'manual' }]
    const gaps = analyzeDepletion(meds, rules)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].nutrient_en).toBe('Vitamin B12')
    expect(gaps[0].source).toBe('drug')
  })

  it('같은 영양소가 여러 규칙에 걸리면 더 높은 severity로 1개만 남긴다', () => {
    // 오메프라졸 + 메트포르민 → 둘 다 B12 (moderate, high) → high 1개
    const meds: SelectMed[] = [
      { name: '넥시움', ingredient: 'Esomeprazole', source: 'manual' },     // prazole → B12(mod), Mg(low)
      { name: '메트포르민', ingredient: 'Metformin', source: 'manual' },     // → B12(high)
    ]
    const gaps = analyzeDepletion(meds, rules)
    const b12 = gaps.filter((g) => g.nutrient_en === 'Vitamin B12')
    expect(b12).toHaveLength(1)
    expect(b12[0].severity).toBe('high')
    expect(gaps.some((g) => g.nutrient_en === 'Magnesium')).toBe(true)
  })

  it('매칭 없으면 빈 배열', () => {
    expect(analyzeDepletion([{ name: '타이레놀', ingredient: 'Acetaminophen', source: 'manual' }], rules)).toEqual([])
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `npm run test -- depletion`
Expected: FAIL ("analyzeDepletion" not exported).

- [ ] **Step 4: 구현**

`src/lib/select/depletion.ts`:
```ts
import type { DepletionRule, Gap, GapSeverity, SelectMed } from './types'

const RANK: Record<GapSeverity, number> = { high: 3, moderate: 2, low: 1 }

// 복약 → 약물성 영양소 고갈 갭. 규칙은 호출자가 DB에서 로드해 주입(테스트 가능).
export function analyzeDepletion(meds: SelectMed[], rules: DepletionRule[]): Gap[] {
  const hay = meds.map((m) => `${m.ingredient} ${m.name}`.toLowerCase())
  const byNutrient = new Map<string, Gap>()

  for (const rule of rules) {
    const hit = rule.match_keywords.some((kw) => {
      const k = kw.toLowerCase()
      return hay.some((h) => h.includes(k))
    })
    if (!hit) continue
    const gap: Gap = {
      nutrient_ko: rule.nutrient_ko,
      nutrient_en: rule.nutrient_en,
      severity: rule.severity,
      source: 'drug',
      reason_ko: rule.mechanism_ko,
    }
    const existing = byNutrient.get(rule.nutrient_en)
    if (!existing || RANK[gap.severity] > RANK[existing.severity]) {
      byNutrient.set(rule.nutrient_en, gap)
    }
  }
  // severity 높은 순 정렬
  return [...byNutrient.values()].sort((a, b) => RANK[b.severity] - RANK[a.severity])
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm run test -- depletion`
Expected: 3 passed.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/select/types.ts src/lib/select/depletion.ts src/lib/select/depletion.test.ts
git commit -m "feat(select): 복약→영양소 고갈 갭 분석(analyzeDepletion) + 타입"
```

---

### Task 4: lib/select/questionnaire.ts (갭 → 짧은 문진)

**Files:**
- Create: `src/lib/select/questionnaire.ts`
- Test: `src/lib/select/questionnaire.test.ts`

**Interfaces:**
- Consumes: `Gap`, `Question` (from `./types`)
- Produces: `function buildQuestionnaire(gaps: Gap[]): Question[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/select/questionnaire.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildQuestionnaire } from './questionnaire'
import type { Gap } from './types'

const gap = (nutrient_en: string, severity: Gap['severity']): Gap => ({
  nutrient_ko: nutrient_en, nutrient_en, severity, source: 'drug', reason_ko: '',
})

describe('buildQuestionnaire', () => {
  it('갭당 1문항 + 안전 필수문항을 만든다', () => {
    const qs = buildQuestionnaire([gap('Vitamin B12', 'high')])
    expect(qs.some((q) => q.kind === 'gap' && q.nutrient_en === 'Vitamin B12')).toBe(true)
    expect(qs.some((q) => q.kind === 'safety')).toBe(true)
  })

  it('문항 수를 6개 이하로 제한한다(갭이 많아도)', () => {
    const many = ['Vitamin B12', 'Magnesium', 'Calcium', 'Zinc', 'Folate', 'Vitamin D', 'Vitamin B6'].map((n) => gap(n, 'high'))
    const qs = buildQuestionnaire(many)
    expect(qs.length).toBeLessThanOrEqual(6)
  })

  it('severity 높은 갭을 우선 포함한다', () => {
    const qs = buildQuestionnaire([gap('Zinc', 'low'), gap('Vitamin B12', 'high')])
    const gapQs = qs.filter((q) => q.kind === 'gap')
    expect(gapQs[0].nutrient_en).toBe('Vitamin B12')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- questionnaire`
Expected: FAIL.

- [ ] **Step 3: 구현**

`src/lib/select/questionnaire.ts`:
```ts
import type { Gap, GapSeverity, Question } from './types'

const RANK: Record<GapSeverity, number> = { high: 3, moderate: 2, low: 1 }

// 영양소별 결핍 확인 문항(평이한 말). 없으면 일반 문구로 폴백.
const SYMPTOM_Q: Record<string, string> = {
  'Vitamin B12': '요즘 손발 저림이나 유난한 피로감을 느끼시나요?',
  Magnesium: '근육 경련(쥐)이나 눈 밑 떨림이 자주 있나요?',
  Potassium: '근력 저하나 무기력함을 느끼시나요?',
  Zinc: '입맛이 없거나 상처가 더디 아무나요?',
  Calcium: '유제품을 거의 안 드시나요?',
  'Vitamin D': '햇빛을 거의 못 쬐는 생활인가요?',
  Folate: '채소를 거의 안 드시나요?',
  'Vitamin B6': '입가 헐거나 손발 저림이 있나요?',
  'Vitamin K': '', // 와파린 주의 — 보충 권유 아님이므로 문항 생략
}

const SAFETY_Q: Question[] = [
  { id: 'safety:allergy', text_ko: '특정 영양제나 음식에 알레르기가 있으신가요?', type: 'yesno', kind: 'safety' },
  { id: 'safety:pregnancy', text_ko: '임신 또는 수유 중이신가요?', type: 'yesno', kind: 'safety' },
  { id: 'safety:current', text_ko: '지금 드시는 영양제가 있나요?', type: 'yesno', kind: 'safety' },
]

const MAX_TOTAL = 6

export function buildQuestionnaire(gaps: Gap[]): Question[] {
  const sorted = [...gaps].sort((a, b) => RANK[b.severity] - RANK[a.severity])
  const gapBudget = Math.max(0, MAX_TOTAL - SAFETY_Q.length) // 안전문항 자리 확보
  const gapQs: Question[] = []
  for (const g of sorted) {
    if (gapQs.length >= gapBudget) break
    const text = SYMPTOM_Q[g.nutrient_en]
    if (text === '') continue // 의도적으로 문항 없음(예: Vitamin K)
    gapQs.push({
      id: `gap:${g.nutrient_en}`,
      text_ko: text ?? `${g.nutrient_ko} 관련해 불편한 증상이 있으신가요?`,
      type: 'yesno',
      kind: 'gap',
      nutrient_en: g.nutrient_en,
    })
  }
  return [...gapQs, ...SAFETY_Q]
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- questionnaire`
Expected: 3 passed.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/select/questionnaire.ts src/lib/select/questionnaire.test.ts
git commit -m "feat(select): 갭 기반 짧은 문진 생성(buildQuestionnaire)"
```

---

### Task 5: lib/select/recommend.ts (후보 → 상호작용·근거 → 랭킹)

**Files:**
- Create: `src/lib/select/recommend.ts`
- Test: `src/lib/select/recommend.test.ts`

**Interfaces:**
- Consumes: `Gap`, `CatalogItem`, `RecItem`, `SelectMed` (from `./types`)
- Produces:
  - `type RecommendDeps = { checkInteraction: (item: CatalogItem, meds: SelectMed[]) => Promise<{ status: 'safe'|'caution'|'blocked'; note_ko: string }>; gradeEvidence: (item: CatalogItem, gap: Gap) => Promise<{ grade: 'A'|'B'|'C'|null; summary_ko: string }> }`
  - `function recommend(input: { gaps: Gap[]; catalog: CatalogItem[] }, deps: RecommendDeps): Promise<RecItem[]>`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/select/recommend.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { recommend, type RecommendDeps } from './recommend'
import type { CatalogItem, Gap } from './types'

const gap: Gap = { nutrient_ko: '비타민 B12', nutrient_en: 'Vitamin B12', severity: 'high', source: 'drug', reason_ko: '흡수 감소' }
const item = (over: Partial<CatalogItem>): CatalogItem => ({
  id: '1', nutrient_en: 'Vitamin B12', product_name_ko: 'B12 1000', form: '정', typical_dose_ko: '1일 1정',
  ingredient_en: 'cyanocobalamin', interaction_query_ko: '비타민 B12', cautions_ko: null, ...over,
})

const deps = (status: 'safe'|'caution'|'blocked', grade: 'A'|'B'|'C'|null): RecommendDeps => ({
  checkInteraction: async () => ({ status, note_ko: status === 'blocked' ? '병용 위험' : '' }),
  gradeEvidence: async () => ({ grade, summary_ko: '근거 요약' }),
})

describe('recommend', () => {
  it('갭의 후보를 상호작용·근거로 채운다', async () => {
    const recs = await recommend({ gaps: [gap], catalog: [item({})] }, deps('safe', 'A'))
    expect(recs).toHaveLength(1)
    expect(recs[0].evidence_grade).toBe('A')
    expect(recs[0].interaction_status).toBe('safe')
    expect(recs[0].nutrient_ko).toBe('비타민 B12')
  })

  it('blocked 후보는 제외한다', async () => {
    const recs = await recommend({ gaps: [gap], catalog: [item({})] }, deps('blocked', 'A'))
    expect(recs).toHaveLength(0)
  })

  it('안전 우선, 그다음 근거 높은 순으로 정렬한다', async () => {
    const mixed: RecommendDeps = {
      checkInteraction: async (it) => ({ status: it.id === 'caution' ? 'caution' : 'safe', note_ko: '' }),
      gradeEvidence: async (it) => ({ grade: it.id === 'A' ? 'A' : it.id === 'caution' ? 'A' : 'C', summary_ko: '' }),
    }
    const catalog = [item({ id: 'C' }), item({ id: 'caution' }), item({ id: 'A' })]
    const recs = await recommend({ gaps: [gap], catalog }, mixed)
    expect(recs.map((r) => r.product_name_ko)).toBeTruthy()
    // 첫 항목은 safe+A
    expect(recs[0].interaction_status).toBe('safe')
    expect(recs[0].evidence_grade).toBe('A')
    // caution은 safe들보다 뒤
    expect(recs[recs.length - 1].interaction_status).toBe('caution')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- recommend`
Expected: FAIL.

- [ ] **Step 3: 구현**

`src/lib/select/recommend.ts`:
```ts
import type { CatalogItem, Gap, RecItem, SelectMed } from './types'

export type RecommendDeps = {
  checkInteraction: (item: CatalogItem, meds: SelectMed[]) => Promise<{ status: 'safe' | 'caution' | 'blocked'; note_ko: string }>
  gradeEvidence: (item: CatalogItem, gap: Gap) => Promise<{ grade: 'A' | 'B' | 'C' | null; summary_ko: string }>
}

const STATUS_RANK = { safe: 0, caution: 1, blocked: 2 } as const
const GRADE_RANK: Record<'A' | 'B' | 'C', number> = { A: 0, B: 1, C: 2 }
const gradeScore = (g: 'A' | 'B' | 'C' | null) => (g ? GRADE_RANK[g] : 3)

/**
 * 확정 갭 → 후보 건기식 → 상호작용·근거 채움 → blocked 제외 → 안전∧근거순 정렬.
 * meds는 deps 클로저가 들고 있다(서버 액션에서 주입).
 */
export async function recommend(
  input: { gaps: Gap[]; catalog: CatalogItem[] },
  deps: RecommendDeps,
): Promise<RecItem[]> {
  const meds: SelectMed[] = [] // deps.checkInteraction이 실제 meds를 클로저로 사용
  const tasks: Promise<RecItem | null>[] = []

  for (const gap of input.gaps) {
    const candidates = input.catalog.filter((c) => c.nutrient_en === gap.nutrient_en)
    for (const item of candidates) {
      tasks.push(
        (async () => {
          const [inter, ev] = await Promise.all([
            deps.checkInteraction(item, meds),
            deps.gradeEvidence(item, gap),
          ])
          if (inter.status === 'blocked') return null
          return {
            product_name_ko: item.product_name_ko,
            nutrient_ko: gap.nutrient_ko,
            evidence_grade: ev.grade,
            evidence_summary_ko: ev.summary_ko,
            interaction_status: inter.status,
            interaction_note_ko: inter.note_ko,
            dose_note_ko: `${item.form} · ${item.typical_dose_ko}`,
          } satisfies RecItem
        })(),
      )
    }
  }

  const results = (await Promise.all(tasks)).filter((r): r is RecItem => r !== null)
  return results.sort(
    (a, b) =>
      STATUS_RANK[a.interaction_status] - STATUS_RANK[b.interaction_status] ||
      gradeScore(a.evidence_grade) - gradeScore(b.evidence_grade),
  )
}
```

> 주의: `meds`는 `deps.checkInteraction` 클로저가 실제 복약을 들고 있다(서버 액션에서 바인딩). recommend는 meds 내용을 직접 모른다 — 테스트에서 deps가 status를 결정.

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- recommend`
Expected: 3 passed.

- [ ] **Step 5: 전체 테스트 + 타입 확인**

Run: `npm run test && npx tsc --noEmit`
Expected: 모두 통과, tsc 0.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/select/recommend.ts src/lib/select/recommend.test.ts
git commit -m "feat(select): 후보→상호작용·근거→랭킹 추천(recommend)"
```

---

### Task 6: 서버 액션 — 상담 CRUD + 엔진 바인딩

**Files:**
- Create: `src/app/pharmacy/(app)/select/actions.ts`

**Interfaces:**
- Consumes: `analyzeDepletion`, `buildQuestionnaire`, `recommend`, `RecommendDeps`, 모든 `./types`. 재사용: `analyzeInteraction`(`@/lib/supplement-interaction`), `searchGradedEvidence`(`@/lib/evidence-grade`), `createClient`(`@/lib/supabase/server`).
- Produces (server actions):
  - `createConsultation(input: { patient_label: string; meds: SelectMed[] }): Promise<{ id: string; gaps: Gap[]; questions: Question[] }>`
  - `runRecommend(id: string, survey: Record<string, string>): Promise<RecItem[]>`
  - `confirmConsultation(id: string, recommendations: RecItem[]): Promise<void>`
  - `recordPurchase(id: string, purchased: { product_name_ko: string }[]): Promise<void>`

- [ ] **Step 1: 액션 구현**

`src/app/pharmacy/(app)/select/actions.ts`:
```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { analyzeDepletion } from '@/lib/select/depletion'
import { buildQuestionnaire } from '@/lib/select/questionnaire'
import { recommend, type RecommendDeps } from '@/lib/select/recommend'
import { analyzeInteraction } from '@/lib/supplement-interaction'
import { searchGradedEvidence } from '@/lib/evidence-grade'
import type { CatalogItem, DepletionRule, Gap, Question, RecItem, SelectMed } from '@/lib/select/types'

// 현재 약사의 약국 id (RLS와 동일 기준). 없으면 throw.
async function requirePharmacy() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('인증 필요')
  const { data: pharmacy } = await sb.from('pharmacies').select('id').eq('owner_id', user.id).maybeSingle()
  if (!pharmacy) throw new Error('약국 계정 아님')
  return { sb, userId: user.id, pharmacyId: pharmacy.id as string }
}

export async function createConsultation(input: { patient_label: string; meds: SelectMed[] }) {
  const { sb, userId, pharmacyId } = await requirePharmacy()
  const { data: rules } = await sb.from('nutrient_depletion').select('*')
  const gaps = analyzeDepletion(input.meds, (rules ?? []) as DepletionRule[])
  const questions = buildQuestionnaire(gaps)
  const { data, error } = await sb.from('select_consultations').insert({
    pharmacy_id: pharmacyId, created_by: userId, patient_label: input.patient_label,
    meds: input.meds, gaps, survey: {}, recommendations: [], purchased: [], status: 'draft',
  }).select('id').single()
  if (error) throw new Error(error.message)
  return { id: data.id as string, gaps, questions: questions as Question[] }
}

export async function runRecommend(id: string, survey: Record<string, string>): Promise<RecItem[]> {
  const { sb } = await requirePharmacy()
  const { data: row } = await sb.from('select_consultations').select('meds, gaps').eq('id', id).single()
  const meds = (row?.meds ?? []) as SelectMed[]
  const gaps = (row?.gaps ?? []) as Gap[]
  const { data: catalog } = await sb.from('supplement_catalog').select('*').eq('active', true)

  const apiKey = process.env.MEDDATA_API_KEY ?? ''
  const deps: RecommendDeps = {
    // 후보 × 각 복약 → 최악 상태로 집계. 정규화 실패는 'caution: 약사 확인'으로(은폐 금지).
    checkInteraction: async (item) => {
      const query = item.interaction_query_ko ?? item.product_name_ko
      let worst: 'safe' | 'caution' | 'blocked' = 'safe'
      const notes: string[] = []
      for (const med of meds) {
        const res = await analyzeInteraction(query, med.ingredient || med.name, { apiKey })
        if (res.status === 'INTERACTION_FOUND' && res.interactions.length > 0) {
          worst = 'caution'
          notes.push(`${med.name}: ${res.interactions[0].description.slice(0, 60)}`)
        } else if (res.status === 'NORMALIZE_FAIL' || res.status === 'SUPPLEMENT_NOT_IN_DB' || res.status === 'NO_API_KEY') {
          if (worst === 'safe') worst = 'caution'
          notes.push('자동 점검 불가 — 약사 확인 필요')
        }
      }
      return { status: worst, note_ko: notes.join(' / ') }
    },
    // 근거: PubMed 등급(무료). Phase 0는 인용 한 줄(효능 단정 금지). 한국어 요약은 Phase 1.
    gradeEvidence: async (item, gap) => {
      const arts = await searchGradedEvidence({ query: `${item.ingredient_en} ${gap.nutrient_en} deficiency`, retmax: 3, fromYear: 2010 })
      if (arts.length === 0) return { grade: null, summary_ko: '관련 논문을 찾지 못했습니다.' }
      const top = arts[0]
      return { grade: top.grade, summary_ko: `${top.gradeLabel} · ${top.journal} ${top.year}` }
    },
  }

  const recs = await recommend({ gaps, catalog: (catalog ?? []) as CatalogItem[] }, deps)
  await sb.from('select_consultations').update({ survey, recommendations: recs, updated_at: new Date().toISOString() }).eq('id', id)
  return recs
}

export async function confirmConsultation(id: string, recommendations: RecItem[]) {
  const { sb } = await requirePharmacy()
  const { error } = await sb.from('select_consultations')
    .update({ recommendations, status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function recordPurchase(id: string, purchased: { product_name_ko: string }[]) {
  const { sb } = await requirePharmacy()
  const { error } = await sb.from('select_consultations')
    .update({ purchased, status: 'closed', updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 0 에러. (DB 타입이 새 테이블을 모르면 에러 → Task 7에서 해결. 임시로 `as` 캐스팅이 들어가 있어 통과해야 함. 만약 `select_consultations`/`supplement_catalog`/`nutrient_depletion`을 `from()`이 모른다고 에러나면 Task 7을 먼저 수행.)

- [ ] **Step 3: 커밋**

```bash
git add "src/app/pharmacy/(app)/select/actions.ts"
git commit -m "feat(select): 상담 서버 액션 + 상호작용·근거 엔진 바인딩"
```

---

### Task 7: DB 타입 갱신 (신규 테이블)

**Files:**
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: `Database` 타입에 `nutrient_depletion`·`supplement_catalog`·`select_consultations` 추가 → 액션의 `from()` 타입 안전.

- [ ] **Step 1: 타입 생성**

Supabase MCP `generate_typescript_types` 실행 → 출력으로 `src/types/database.ts` 교체. (또는 수동으로 세 테이블 Row/Insert/Update를 기존 패턴대로 추가.)

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 0 에러. 액션의 `as DepletionRule[]` 등 캐스팅이 실제 Row 타입과 호환.

- [ ] **Step 3: 커밋**

```bash
git add src/types/database.ts
git commit -m "feat(select): DB 타입에 셀렉트 테이블 3종 반영"
```

---

### Task 8: UI — 상담 목록 페이지 `/pharmacy/select`

**Files:**
- Create: `src/app/pharmacy/(app)/select/page.tsx`

**Interfaces:**
- Consumes: `createClient`. 최근 상담·전환율 표시.

- [ ] **Step 1: 목록 페이지 작성**

`src/app/pharmacy/(app)/select/page.tsx`:
```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { YCCard } from '@/components/yc/yc-card'
import { SectionHeader } from '@/components/yc/section-header'

export default async function SelectListPage() {
  const sb = await createClient()
  const { data: rows } = await sb
    .from('select_consultations')
    .select('id, patient_label, recommendations, purchased, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  const list = rows ?? []
  const closed = list.filter((r) => r.status === 'closed')
  const recTotal = closed.reduce((s, r) => s + ((r.recommendations as unknown[]) ?? []).length, 0)
  const buyTotal = closed.reduce((s, r) => s + ((r.purchased as unknown[]) ?? []).length, 0)
  const conv = recTotal > 0 ? Math.round((buyTotal / recTotal) * 100) : 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionHeader label="맞춤 건기식 상담" showDot={false} />
        <Link href="/pharmacy/select/new" className="h-11 px-4 inline-flex items-center rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:opacity-80">
          새 상담
        </Link>
      </div>

      <YCCard variant="brand" className="px-5 py-4">
        <p className="text-sm text-yc-neutral600">완료 상담 {closed.length}건 · 추천 {recTotal} · 구매 {buyTotal}</p>
        <p className="text-2xl font-bold text-yc-green700 mt-1">전환율 {conv}%</p>
      </YCCard>

      <div className="space-y-2">
        {list.map((r) => (
          <YCCard key={r.id} className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-yc-neutral800">{r.patient_label || '이름 없음'}</p>
              <p className="text-xs text-yc-neutral500">{new Date(r.created_at as string).toLocaleDateString('ko-KR')} · {r.status}</p>
            </div>
            <span className="text-xs text-yc-neutral500">추천 {((r.recommendations as unknown[]) ?? []).length}</span>
          </YCCard>
        ))}
        {list.length === 0 && <p className="text-sm text-yc-neutral500 px-1">아직 상담이 없습니다. ‘새 상담’으로 시작하세요.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 타입·린트 확인**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0/0. (YCCard variant·SectionHeader props는 기존 사용처(`lifestyle-section.tsx`)와 동일하게. 다르면 그 파일 보고 맞출 것.)

- [ ] **Step 3: 커밋**

```bash
git add "src/app/pharmacy/(app)/select/page.tsx"
git commit -m "feat(select): 상담 목록 + 전환율 대시보드 페이지"
```

---

### Task 9: UI — 새 상담 마법사 `/pharmacy/select/new`

**Files:**
- Create: `src/app/pharmacy/(app)/select/new/page.tsx` (서버 셸)
- Create: `src/app/pharmacy/(app)/select/new/select-wizard.tsx` (클라이언트 마법사)

**Interfaces:**
- Consumes: `createConsultation`, `runRecommend`, `confirmConsultation`, `recordPurchase` (from `../actions`).

- [ ] **Step 1: 서버 셸 작성**

`src/app/pharmacy/(app)/select/new/page.tsx`:
```tsx
import SelectWizard from './select-wizard'

export default function NewConsultationPage() {
  return <SelectWizard />
}
```

- [ ] **Step 2: 클라이언트 마법사 작성**

`src/app/pharmacy/(app)/select/new/select-wizard.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { YCCard } from '@/components/yc/yc-card'
import { EvidenceGradeBadge } from '@/components/yc/evidence-grade-badge'
import { createConsultation, runRecommend, confirmConsultation, recordPurchase } from '../actions'
import type { Gap, Question, RecItem, SelectMed } from '@/lib/select/types'

type Step = 'meds' | 'survey' | 'recs' | 'done'

export default function SelectWizard() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('meds')
  const [label, setLabel] = useState('')
  const [medText, setMedText] = useState('')
  const [id, setId] = useState('')
  const [gaps, setGaps] = useState<Gap[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [survey, setSurvey] = useState<Record<string, string>>({})
  const [recs, setRecs] = useState<RecItem[]>([])
  const [bought, setBought] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  // 복약 입력: 한 줄에 "약명, 성분" — Phase 0는 수동입력(OCR 연결은 후속 step)
  function parseMeds(): SelectMed[] {
    return medText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, ingredient] = l.split(',').map((s) => s.trim())
      return { name: name ?? l, ingredient: ingredient ?? name ?? l, source: 'manual' as const }
    })
  }

  async function startConsult() {
    setBusy(true)
    try {
      const r = await createConsultation({ patient_label: label, meds: parseMeds() })
      setId(r.id); setGaps(r.gaps); setQuestions(r.questions); setStep('survey')
    } catch (e) { toast.error(e instanceof Error ? e.message : '실패') } finally { setBusy(false) }
  }

  async function submitSurvey() {
    setBusy(true)
    try { setRecs(await runRecommend(id, survey)); setStep('recs') }
    catch (e) { toast.error(e instanceof Error ? e.message : '실패') } finally { setBusy(false) }
  }

  async function confirm() {
    setBusy(true)
    try { await confirmConsultation(id, recs); toast.success('추천 확정'); setStep('done') }
    catch (e) { toast.error(e instanceof Error ? e.message : '실패') } finally { setBusy(false) }
  }

  async function finish() {
    setBusy(true)
    try {
      await recordPurchase(id, recs.filter((r) => bought.has(r.product_name_ko)).map((r) => ({ product_name_ko: r.product_name_ko })))
      toast.success('구매 결과 저장'); router.push('/pharmacy/select')
    } catch (e) { toast.error(e instanceof Error ? e.message : '실패') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5 max-w-xl">
      {step === 'meds' && (
        <YCCard className="px-5 py-4 space-y-3">
          <p className="font-semibold text-yc-neutral800">환자 메모 · 복약 입력</p>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 단골 김OO 75세"
            className="w-full h-11 px-3 rounded-yc-md border border-yc-neutral200 text-base" />
          <textarea value={medText} onChange={(e) => setMedText(e.target.value)} rows={5}
            placeholder={'한 줄에 한 약 (약명, 성분)\n예) 다이아벡스, metformin\n넥시움, esomeprazole'}
            className="w-full px-3 py-2 rounded-yc-md border border-yc-neutral200 text-base" />
          <button disabled={busy || !medText.trim()} onClick={startConsult}
            className="h-12 w-full rounded-yc-md bg-yc-green600 text-white font-semibold active:opacity-80 disabled:opacity-50">
            부족 분석 시작
          </button>
        </YCCard>
      )}

      {step === 'survey' && (
        <YCCard className="px-5 py-4 space-y-4">
          <div>
            <p className="font-semibold text-yc-neutral800">예상 부족 영양소</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {gaps.map((g) => <span key={g.nutrient_en} className="text-sm bg-yc-green50 text-yc-green700 rounded-full px-3 py-1">{g.nutrient_ko} ({g.severity})</span>)}
              {gaps.length === 0 && <span className="text-sm text-yc-neutral500">약물성 고갈 후보 없음</span>}
            </div>
          </div>
          <div className="space-y-3">
            {questions.map((q) => (
              <div key={q.id}>
                <p className="text-base text-yc-neutral800 mb-1">{q.text_ko}</p>
                <div className="flex gap-2">
                  {['예', '아니오'].map((c) => (
                    <button key={c} onClick={() => setSurvey({ ...survey, [q.id]: c })}
                      className={`h-11 px-5 rounded-yc-md border text-sm font-medium ${survey[q.id] === c ? 'bg-yc-green600 text-white border-yc-green600' : 'border-yc-neutral200 text-yc-neutral700'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button disabled={busy} onClick={submitSurvey}
            className="h-12 w-full rounded-yc-md bg-yc-green600 text-white font-semibold active:opacity-80 disabled:opacity-50">
            추천 만들기
          </button>
        </YCCard>
      )}

      {step === 'recs' && (
        <div className="space-y-3">
          <p className="font-semibold text-yc-neutral800">추천 (약사 검수)</p>
          {recs.map((r) => (
            <YCCard key={r.product_name_ko} className="px-5 py-4 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-yc-neutral800">{r.product_name_ko}</span>
                {r.evidence_grade && <EvidenceGradeBadge grade={r.evidence_grade} />}
                {r.interaction_status !== 'safe' && <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">상호작용 {r.interaction_status === 'blocked' ? '차단' : '주의'}</span>}
              </div>
              <p className="text-sm text-yc-neutral600">{r.nutrient_ko} · {r.dose_note_ko}</p>
              <p className="text-xs text-yc-neutral500">{r.evidence_summary_ko}</p>
              {r.interaction_note_ko && <p className="text-xs text-amber-700">{r.interaction_note_ko}</p>}
            </YCCard>
          ))}
          {recs.length === 0 && <p className="text-sm text-yc-neutral500">안전·근거 조건을 통과한 추천이 없습니다.</p>}
          <button disabled={busy} onClick={confirm} className="h-12 w-full rounded-yc-md bg-yc-green600 text-white font-semibold active:opacity-80 disabled:opacity-50">추천 확정</button>
        </div>
      )}

      {step === 'done' && (
        <YCCard className="px-5 py-4 space-y-3">
          <p className="font-semibold text-yc-neutral800">구매 결과 기록 (전환율)</p>
          {recs.map((r) => (
            <label key={r.product_name_ko} className="flex items-center gap-3 py-1">
              <input type="checkbox" checked={bought.has(r.product_name_ko)}
                onChange={(e) => { const n = new Set(bought); e.target.checked ? n.add(r.product_name_ko) : n.delete(r.product_name_ko); setBought(n) }} />
              <span className="text-base text-yc-neutral800">{r.product_name_ko}</span>
            </label>
          ))}
          <button disabled={busy} onClick={finish} className="h-12 w-full rounded-yc-md bg-yc-green600 text-white font-semibold active:opacity-80 disabled:opacity-50">저장하고 마치기</button>
        </YCCard>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 타입·린트 확인**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0/0. (YCCard·EvidenceGradeBadge·yc-* 토큰은 기존 사용처와 일치시킬 것. `bg-amber-100`이 토큰에 없으면 `bg-yc-green50`+텍스트로 대체.)

- [ ] **Step 4: 커밋**

```bash
git add "src/app/pharmacy/(app)/select/new/"
git commit -m "feat(select): 새 상담 마법사(복약→문진→추천→구매기록)"
```

---

### Task 10: 약사 대시보드에 진입 링크 + 최종 검증

**Files:**
- Modify: `src/app/pharmacy/(app)/page.tsx` (대시보드에 ‘맞춤 건기식 상담’ 카드/링크 추가)

**Interfaces:**
- Consumes: 없음(링크만).

- [ ] **Step 1: 대시보드에 링크 추가**

`src/app/pharmacy/(app)/page.tsx`를 열어, 기존 카드 그리드/섹션 패턴을 따라 `/pharmacy/select`로 가는 링크 카드 1개를 추가한다. 예(기존 카드 컴포넌트가 있으면 그걸 사용, 없으면):
```tsx
<Link href="/pharmacy/select" className="block">
  <YCCard variant="brand" className="px-5 py-4">
    <p className="font-semibold text-yc-green700">맞춤 건기식 상담</p>
    <p className="text-sm text-yc-neutral600 mt-1">복약 기반으로 부족 영양소를 찾아 안전·근거로 추천</p>
  </YCCard>
</Link>
```
(상단에 `import Link from 'next/link'`, `import { YCCard } from '@/components/yc/yc-card'`가 없으면 추가.)

- [ ] **Step 2: 전체 검증**

Run: `npm run test && npx tsc --noEmit && npm run lint`
Expected: 테스트 통과 · tsc 0 · lint 0.

- [ ] **Step 3: 수동 수용 테스트 (개화약국 시나리오)**

`npm run dev` → 약사 로그인 → `/pharmacy/select` → 새 상담 →
입력: `다이아벡스, metformin` + `넥시움, esomeprazole` →
기대: 부족 영양소에 **비타민 B12(high)·마그네슘** 표시 → 문진 3~6문항 → 추천 카드(B12 1000 등, 근거배지·상호작용 상태) → 확정 → 구매 체크 → 목록에서 전환율 갱신.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/pharmacy/(app)/page.tsx"
git commit -m "feat(select): 약사 대시보드에 맞춤 건기식 상담 진입 추가"
```

---

## 부록: 운영 메모 (코드 아님)

- 시드 `supplement_catalog`는 예시 → **개화약국 실제 취급 완제품·성분으로 교체**(약사 작업).
- `nutrient_depletion`은 운영하며 약사가 확장(해자). `interaction_query_ko`는 상호작용 자동점검 적중을 위해 ko 사전 커버 명칭으로 맞출 것.
- Phase 0 검증 KPI = `/pharmacy/select` 상단 **전환율**. N건 쌓이면 소분/구독(Phase 1) vs 타약국 SaaS 판단.
- 규제: 완제품 권유만(소분 0) → 판매업 신고 불필요. 효능 단정 금지·약사 검수 게이트 유지.

## Self-Review 결과 (작성자 점검)
- 스펙 §3~§9 각 항목 → Task 매핑 확인(흐름·테이블·재사용·규제·테스트 모두 커버).
- 플레이스홀더 없음(모든 코드 스텝에 실제 코드). 타입 일관(`SelectMed`/`Gap`/`CatalogItem`/`RecItem`/`RecommendDeps` 시그니처 Task 간 동일).
- 알려진 한계(의도적): ① 복약 OCR 연결은 Phase 0 수동입력으로 시작(OCR은 후속) ② 근거 한국어 요약은 인용 한 줄로 시작(Claude 요약은 Phase 1) ③ 상호작용 자동점검은 ko사전 커버 범위 내에서만 — 미커버는 'caution: 약사 확인'으로 **은폐 없이** 노출.
