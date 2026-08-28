# 약 정보·생활관리 정보 가독성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 약 지갑의 약 정보 패널(855자)과 생활관리 정보(질환당 900자)를 접어서, 기본 화면이 1스크롤 안에 들어오게 한다.

**Architecture:** 약 정보는 식약처 원문이라 **글자를 바꾸지 않는다** — 순수 함수로 문장을 자르고 어미로 분류해 긴 두 필드(주의사항·부작용)만 `<details>`로 접는다. 생활관리는 우리가 생성한 콘텐츠라 **생성 시점에 요약을 함께 만들어** 컬럼에 저장하고, 카드엔 요약·펼치면 전문을 둔다. 접기는 양쪽 다 `<details>`를 써서 생활관리 섹션이 서버 컴포넌트로 남게 한다.

**Tech Stack:** Next.js 16 App Router · TypeScript · Supabase(PostgREST) · node:test · Playwright · Anthropic SDK(생성 스크립트)

**Spec:** `docs/superpowers/specs/2026-08-28-drug-info-readability-design.md`

## Global Constraints

- **원문 불변**: 약 정보 텍스트는 고르고 재배열만 한다. 글자 변경·요약·생략 금지. 재조립 시 원문 문장 집합과 일치해야 한다.
- **음성 판정 금지**: 신규 문구는 사실 서술로 끝내고 판정·지시를 담지 않는다. 기존 푸터(`자료: 식품의약품안전처 · 정확한 판단은 담당 약사와 상담하세요`)를 유지한다.
- **금칙어 스캔 범위**: 앱이 쓴 문구만 대상. 원문 인용 블록은 `data-quoted="mfds"`로 제외한다(원문에는 `1일 5회(75 mg/kg)`·`복용하지 마십시오`가 정당하게 들어 있다).
- **터치 타겟**: 새로 생기는 인터랙티브 요소는 `min-h-[44px]`.
- **마이그레이션 번호**: 이 작업이 `069`를 쓴다. 상호작용 계획(`plans/linear-knitting-simon.md`)의 DUR flag types 확장은 `070`으로 밀린다.
- **마이그레이션 적용**: 저장소 관례상 Supabase SQL Editor에서 **사람이 수동 적용**한다. 스크립트로 적용하지 말 것.
- 테스트 실행: `npm run test:unit` · `node e2e/wallet-signal-qa.mjs`(서버가 `localhost:3000`에 떠 있어야 함) · `npx tsc --noEmit` · `npm run lint`

## File Structure

| 파일 | 책임 |
|---|---|
| `src/lib/drug-text.ts` (신규) | 한국어 원문 문장 분리 + 어미 기반 분류. 순수 함수, DOM·React 의존 0 |
| `src/lib/drug-text.test.ts` (신규) | 실원문 픽스처로 원문 불변·분리 정확성 고정 |
| `src/components/yc/collapsible-note.tsx` (신규) | `<details>` 기반 접기 — 양쪽 화면이 공유. 서버/클라 양쪽에서 쓸 수 있게 상태 없음 |
| `src/app/(main)/@wallet/med-card-item.tsx` (수정) | 패널에서 주의사항·부작용을 접기로 전환 |
| `supabase/migrations/069_lifestyle_summary.sql` (신규) | `lifestyle_content.summary_ko` 추가 |
| `scripts/gen-lifestyle-content.mjs` (수정) | 본문과 같은 호출에서 요약 생성 |
| `src/lib/lifestyle-info/server.ts` (수정) | `summary_ko`도 안전 게이트 통과분만 채택, 실패 시 null |
| `src/app/(main)/@wallet/lifestyle-section.tsx` (수정) | 요약 기본 + 펼치면 전문·출처 |
| `e2e/wallet-signal-qa.mjs` (수정) | 접힘·펼침·터치 타겟·폴백 회귀 가드 |

---

### Task 1: 원문 문장 분리·분류 순수 함수

**Files:**
- Create: `src/lib/drug-text.ts`
- Test: `src/lib/drug-text.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수)
- Produces:
  - `splitSentences(text: string | null | undefined): string[]`
  - `groupCautions(sentences: string[]): { prohibit: string[]; consult: string[]; caution: string[] }`
  - `orderedCautions(text: string | null | undefined): string[]` — 분류 순서(prohibit→consult→caution)로 평탄화. 분리 실패 시 원문 1개 배열

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/drug-text.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitSentences, groupCautions, orderedCautions } from './drug-text.ts'

// 페니라민정 실제 주의사항 원문(운영 e약은요, 2026-08-28)
const ATPN = '이 약에 과민증 환자, 녹내장, 전립선비대 등 하부요로폐색(닫혀서 막힘)성 질환, 미숙아 및 신생아는 이 약을 복용하지 마십시오. 이 약을 복용하기 전에 3세 미만 유아, 임부 및 수유부, 고령자, 안내압(눈내부 압력) 상승, 갑상샘기능항진, 협착(좁아짐)성 소화성궤양 또는 유문십이지장 폐색, 순환계질환, 고혈압 등 심혈관 질환, 기관지염, 기관지확장증 및 천식, 간질, 간질환, 뇌졸증, 중증(심한 증상) 관상동맥부전, 발작 환자 또는 경험자는 의사 또는 약사와 상의하십시오. 이 약은 복용 후 졸음을 유발할 수 있으므로 운전 및 기계조작 시 주의하십시오.'

test('종결어미 기준으로 문장을 나눈다', () => {
  const s = splitSentences(ATPN)
  assert.equal(s.length, 3)
  assert.match(s[0], /복용하지 마십시오\.$/)
  assert.match(s[1], /상의하십시오\.$/)
  assert.match(s[2], /주의하십시오\.$/)
})

test('재조립하면 원문과 같다 — 누락·변조 0', () => {
  const s = splitSentences(ATPN)
  assert.equal(s.join(' '), ATPN)
})

test('용량 표기의 소수점에서 자르지 않는다', () => {
  const t = '만 7~12세 소아는 1회 권장용량을 4~6시간마다 복용합니다. 1일 5회(75 mg/kg)를 초과하여 복용하지 않습니다.'
  const s = splitSentences(t)
  assert.equal(s.length, 2)
  assert.ok(s[1].includes('75 mg/kg'))
})

test('비율 표기(3.0~3.7)에서 자르지 않는다', () => {
  const s = splitSentences('이 약은 엑스(3.0~3.7→1)를 함유합니다. 보관에 주의합니다.')
  assert.equal(s.length, 2)
  assert.ok(s[0].includes('3.0~3.7'))
})

test('어미로 금기·상담·주의를 가른다', () => {
  const g = groupCautions(splitSentences(ATPN))
  assert.equal(g.prohibit.length, 1)
  assert.equal(g.consult.length, 1)
  assert.equal(g.caution.length, 1)
  assert.match(g.prohibit[0], /복용하지 마십시오/)
})

test('금기 문장이 맨 앞으로 온다', () => {
  const ordered = orderedCautions(ATPN)
  assert.match(ordered[0], /복용하지 마십시오/)
  assert.equal(ordered.length, 3)
})

test('분리에 실패하면 원문을 통째로 돌려준다', () => {
  const one = '마침표가 없는 한 덩어리 텍스트'
  assert.deepEqual(orderedCautions(one), [one])
})

test('빈 값은 빈 배열', () => {
  assert.deepEqual(splitSentences(''), [])
  assert.deepEqual(splitSentences(null), [])
  assert.deepEqual(orderedCautions(undefined), [])
})

test('반복 호출이 같은 결과를 낸다', () => {
  for (let i = 0; i < 3; i++) assert.equal(splitSentences(ATPN).length, 3)
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './drug-text.ts'`

- [ ] **Step 3: 최소 구현을 쓴다**

`src/lib/drug-text.ts`:

```ts
// 식약처 원문(e약은요)을 화면에서 접기 위한 문장 단위 구조화.
//
// ⚠️ 이 모듈은 원문 글자를 절대 바꾸지 않는다. 고르고 재배열만 한다.
// 주의사항 길이의 대부분은 **금기 대상 목록**이라(과민증·녹내장·전립선비대…),
// 요약하면 그 목록에서 항목이 빠진다. 약 설명에서 누락은 추가만큼 위험하다 —
// "녹내장"이 빠진 요약을 녹내장 환자가 읽는 상황이 된다.
// drug-text.test.ts 의 "재조립하면 원문과 같다" 가 그 계약을 고정한다.

// 마침표 앞 음절이 한국어 종결형일 때만 자른다. 마침표 전부를 기준으로 자르면
// `1일 5회(75 mg/kg)`·`3.0~3.7` 같은 용량·비율 표기가 문장을 쪼갠다.
// 관찰된 종결형: …마십시오. …상의하십시오. …주의하십시오. …합니다. …있습니다.
const SENTENCE_END = /(?<=[다요오])\.\s+/

export function splitSentences(text: string | null | undefined): string[] {
  if (!text) return []
  return String(text)
    .split(/\r?\n+/)
    .flatMap(line => line.split(SENTENCE_END))
    .map(s => s.trim())
    .filter(Boolean)
}

// 어미 매칭만 한다 — 의미 해석이 아니라 결정론적 분류다.
const PROHIBIT = /(복용하지 마십시오|투여하지 마십시오|사용하지 마십시오|금기)/
const CONSULT  = /(상의하십시오|상담하십시오|문의하십시오)/

export function groupCautions(sentences: string[]) {
  const prohibit: string[] = []
  const consult:  string[] = []
  const caution:  string[] = []
  for (const s of sentences) {
    if (PROHIBIT.test(s)) prohibit.push(s)
    else if (CONSULT.test(s)) consult.push(s)
    else caution.push(s)
  }
  return { prohibit, consult, caution }
}

/** 표시 순서(금기 → 상담 → 주의)로 평탄화. 분리 실패 시 원문 1개. */
export function orderedCautions(text: string | null | undefined): string[] {
  const sentences = splitSentences(text)
  if (sentences.length < 2) return sentences
  const g = groupCautions(sentences)
  return [...g.prohibit, ...g.consult, ...g.caution]
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm run test:unit`
Expected: PASS — 신규 9건 포함 전체 통과

- [ ] **Step 5: 커밋**

```bash
git add src/lib/drug-text.ts src/lib/drug-text.test.ts
git commit -m "feat(drug-text): 원문 문장 분리·어미 분류 순수 함수

약 정보 패널을 접기 위해 식약처 원문을 문장 단위로 구조화한다. 글자는
바꾸지 않는다 — 주의사항 길이의 대부분이 금기 대상 목록이라 요약하면
항목이 빠지고, 약 설명에서 누락은 추가만큼 위험하다.

마침표 앞 음절이 종결형(다/요/오)일 때만 자른다. 마침표 전부를 기준으로
자르면 1일 5회(75 mg/kg) 같은 용량 표기가 문장을 쪼갠다.

재조립하면 원문과 같다는 단언이 이 계약을 고정한다."
```

---

### Task 2: 공용 접기 컴포넌트

**Files:**
- Create: `src/components/yc/collapsible-note.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: `CollapsibleNote({ label, count, children, quoted }: { label: string; count?: number; children: React.ReactNode; quoted?: boolean })`
  - `<details>` 기반. 상태 없음 → 서버 컴포넌트에서도 쓸 수 있다
  - `quoted`가 true면 본문 래퍼에 `data-quoted="mfds"`를 단다(금칙어 스캔 제외 표시)

- [ ] **Step 1: 컴포넌트를 쓴다**

`src/components/yc/collapsible-note.tsx`:

```tsx
// 접기 — <details> 를 쓴다. 상태·JS 가 필요 없어 서버 컴포넌트에서도 쓸 수 있고,
// 스크린리더·키보드 지원이 브라우저 기본이다(lifestyle-section 을 클라로 바꾸지 않는 이유).

export function CollapsibleNote({
  label,
  count,
  quoted = false,
  children,
}: {
  label: string
  count?: number
  quoted?: boolean
  children: React.ReactNode
}) {
  return (
    <details className="group">
      <summary className="min-h-[44px] flex items-center gap-1.5 cursor-pointer list-none text-sm font-semibold text-yc-neutral700 marker:content-['']">
        <span>{label}</span>
        {count != null && <span className="text-yc-neutral500 font-normal">{count}가지</span>}
        <span className="text-yc-green600 ml-auto group-open:hidden">펼치기 ▾</span>
        <span className="text-yc-green600 ml-auto hidden group-open:inline">접기 ▴</span>
      </summary>
      <div
        className="pt-1.5 space-y-1.5"
        // 원문 인용 블록은 금칙어 스캔에서 제외한다 — 원문에는 용량 수치와
        // "복용하지 마십시오" 가 정당하게 들어 있고, 그것을 보여주는 것이 목적이다.
        {...(quoted ? { 'data-quoted': 'mfds' } : {})}
      >
        {children}
      </div>
    </details>
  )
}
```

- [ ] **Step 2: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 에러 0

- [ ] **Step 3: 커밋**

```bash
git add src/components/yc/collapsible-note.tsx
git commit -m "feat(yc): <details> 기반 공용 접기 컴포넌트

상태가 없어 서버 컴포넌트에서도 쓸 수 있다 — lifestyle-section 을
클라이언트로 바꾸지 않고 접기를 넣기 위해서다. 스크린리더·키보드는
브라우저 기본 지원. quoted 는 원문 인용 블록을 금칙어 스캔에서 빼는 표시."
```

---

### Task 3: 약 정보 패널에 접기 적용

**Files:**
- Modify: `src/app/(main)/@wallet/med-card-item.tsx:401-406` (6필드 렌더 블록)
- Test: `e2e/wallet-signal-qa.mjs` (Task 6에서 확장)

**Interfaces:**
- Consumes: `orderedCautions()` (Task 1), `CollapsibleNote` (Task 2)
- Produces: 없음(화면 변경)

- [ ] **Step 1: import 를 추가한다**

`src/app/(main)/@wallet/med-card-item.tsx` 상단 import 블록에:

```ts
import { orderedCautions } from '@/lib/drug-text'
import { CollapsibleNote } from '@/components/yc/collapsible-note'
```

- [ ] **Step 2: 6필드 렌더 블록을 교체한다**

`:401-406` 의 6줄을 아래로 바꾼다. 효능·효과·복용법·상호작용·보관법은 그대로 펼쳐 두고(합 ~315자), 긴 두 필드만 접는다.

```tsx
{info?.efcy       && <p><span className="font-semibold">효능·효과 </span>{info.efcy}</p>}
{info?.useMethod  && <p><span className="font-semibold">복용법 </span>{info.useMethod}</p>}
{info?.intrc      && <p><span className="font-semibold">상호작용 </span>{info.intrc}</p>}
{info?.storage    && <p><span className="font-semibold">보관법 </span>{info.storage}</p>}

{/* 주의사항·부작용이 패널 길이의 대부분(평균 272·268자)이다. 원문은 그대로 두고
    문장 단위로 접는다 — 금기 문장이 맨 위로 온다(orderedCautions). */}
{info?.atpn && (() => {
  const items = orderedCautions(info.atpn)
  return (
    <CollapsibleNote label="복용 전 확인할 것" count={items.length} quoted>
      {items.map((s, i) => (
        <p key={i} className="text-sm text-yc-neutral700 leading-relaxed">{s}</p>
      ))}
    </CollapsibleNote>
  )
})()}

{info?.sideEffect && (() => {
  const items = orderedCautions(info.sideEffect)
  return (
    <CollapsibleNote label="알려진 부작용" count={items.length} quoted>
      {items.map((s, i) => (
        <p key={i} className="text-sm text-yc-neutral700 leading-relaxed">{s}</p>
      ))}
    </CollapsibleNote>
  )
})()}
```

- [ ] **Step 3: 타입 검사·린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러·워닝 0

- [ ] **Step 4: 프로덕션 빌드로 실화면 확인**

Run: `npm run build && npm run start` (별도 셸), 그다음 `node e2e/wallet-signal-qa.mjs`
Expected: 기존 33단언 전부 PASS(회귀 없음)

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(main)/@wallet/med-card-item.tsx"
git commit -m "feat(wallet): 약 정보 패널에서 주의사항·부작용을 접는다

패널 6필드 합이 평균 855자로 3~5 스크롤이었다. 길이의 대부분인
주의사항(272자)·부작용(268자)만 접고, 나머지 넷(315자)은 그대로 편다.

접힌 라벨에 문장 수를 달아 무엇이 얼마나 있는지 먼저 알린다. 펼치면
금기 문장이 맨 위로 온다. 원문 글자는 바뀌지 않는다."
```

---

### Task 4: 생활관리 요약 컬럼 + 생성

**Files:**
- Create: `supabase/migrations/069_lifestyle_summary.sql`
- Modify: `scripts/gen-lifestyle-content.mjs:98-107` (`writeBody`), `:132-139` (upsert)

**Interfaces:**
- Consumes: 없음
- Produces: `lifestyle_content.summary_ko` 컬럼(nullable text)

- [ ] **Step 1: 마이그레이션을 쓴다**

`supabase/migrations/069_lifestyle_summary.sql`:

```sql
-- 069: 생활관리 정보 요약 — 카드 기본은 요약, 펼치면 전문
--
-- 왜: lifestyle_content 본문이 평균 287자이고 질환당 3항목이라 한 질환에 900자,
-- 추정 질환이 3개면 2,700자가 한 번에 렌더된다(lifestyle-section 은 접기 없는 서버 컴포넌트).
--
-- 왜 생성 시점인가: 이 콘텐츠는 우리가 만든 것이라 원문 훼손 개념이 없다. 잘라낸 첫
-- 문장보다 목적을 갖고 쓴 2문장이 읽힌다. 전문은 남기고 한 번 더 눌러서 본다.
-- (식약처 원문인 약 정보는 반대로 표시 계층에서만 줄인다 — src/lib/drug-text.ts)
--
-- nullable 인 이유: 요약도 본문과 같은 안전 게이트(passesSafetyFrame)를 통과해야
-- 채택된다. 실패하면 null 로 두고 화면은 본문을 보여준다 — 요약이 게이트에 걸렸다고
-- 정보 자체가 사라지면 안 된다.

alter table public.lifestyle_content add column if not exists summary_ko text;
```

- [ ] **Step 2: 생성기가 요약을 함께 만들게 한다**

`scripts/gen-lifestyle-content.mjs` 의 `writeBody`(98–107행)를 `writeContent`로 바꾼다. **추가 API 호출 없이** 같은 응답에서 본문과 요약을 받는다.

```js
async function writeContent(disease, topic, papers) {
  const user = `질환군: ${disease}\n주제: ${topic}\n\n아래 PubMed 초록들을 근거로, "${disease}를 관리하는 분들"에게 도움이 될 수 있는 ${topic} 관련 일반 정보를 작성하세요.\n\n` +
    `아래 형식으로 정확히 출력하세요(다른 말 없이):\n` +
    `BODY: (2~3문장 본문)\n` +
    `SUMMARY: (본문을 2문장·100자 내외로 줄인 요약. 본문에 없는 사실을 넣지 말 것)\n\n` +
    papers.map((p, i) => `[논문 ${i + 1}] ${p.title}\n초록: ${p.abstract || '(없음)'}`).join('\n\n')
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 800,
    system: SAFETY_SYSTEM,
    messages: [{ role: 'user', content: user }],
  })
  const raw = res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
  const m = raw.match(/BODY:\s*([\s\S]*?)\s*SUMMARY:\s*([\s\S]*)$/)
  // 형식을 안 지키면 전체를 본문으로 보고 요약은 포기한다 — 요약 없이도 화면은 동작한다
  if (!m) return { body: raw, summary: null }
  return { body: m[1].trim(), summary: m[2].trim() || null }
}
```

- [ ] **Step 3: 호출부와 upsert 를 맞춘다**

`:132` 를 `const { body, summary } = await writeContent(disease, topic, papers)` 로 바꾸고, 요약도 안전 프리체크를 거치게 한 뒤 upsert 에 싣는다.

```js
const { body, summary } = await writeContent(disease, topic, papers)
if (!passesSafety(body)) { console.log(`  🚫 ${disease}/${topic} — 안전 프리체크 실패, 폐기`); skipped++; continue }
// 요약이 게이트에 걸리면 요약만 버린다(본문은 살린다)
const summaryOk = summary && passesSafety(summary) ? summary : null
if (summary && !summaryOk) console.log(`     ⚠ ${disease}/${topic} — 요약 게이트 실패, 본문만 저장`)
```

upsert payload 에 `summary_ko: summaryOk` 를 추가한다.

- [ ] **Step 4: DRY RUN 으로 확인한다**

Run: `node scripts/gen-lifestyle-content.mjs --dry`
Expected: 9건 각각에 본문과 요약이 출력되고, 요약이 100자 내외다. **DB 에 쓰지 않는다.**

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/069_lifestyle_summary.sql scripts/gen-lifestyle-content.mjs
git commit -m "feat(lifestyle): 생성 시점 요약(069) — 본문과 같은 호출에서

본문 평균 287자 × 질환당 3항목 = 900자가 접기 없이 렌더된다. 이 콘텐츠는
우리가 만든 것이라 원문 훼손 개념이 없어, 잘라낸 첫 문장 대신 목적을 갖고
쓴 2문장을 생성 시점에 함께 만든다(추가 호출 없음).

요약도 본문과 같은 안전 프리체크를 거치고, 걸리면 요약만 버린다 —
요약이 실패했다고 본문까지 사라지면 안 된다."
```

⚠️ **069 는 이 시점에 아직 운영 DB 에 적용되지 않았다.** Task 5 착수 전에 사람이 Supabase SQL Editor 에서 적용해야 한다(저장소 관례).

---

### Task 5: 생활관리 화면에 요약 적용

**Files:**
- Modify: `src/lib/lifestyle-info/server.ts:14-22` (타입), `:50-68` (조회·게이트)
- Modify: `src/app/(main)/@wallet/lifestyle-section.tsx:50-74` (카드 렌더)
- Test: `src/lib/lifestyle-info/server.test.ts` (신규)

**Interfaces:**
- Consumes: `lifestyle_content.summary_ko` (Task 4), `CollapsibleNote` (Task 2)
- Produces:
  - `LifestyleTip` 에 `summary_ko: string | null` 필드 추가
  - `toLifestyleTip(row): LifestyleTip` — 행 → 표시 모델 변환 순수 함수(게이트 적용 지점)

- [ ] **Step 0: 폴백 테스트를 먼저 쓴다**

게이트 실패 시 본문으로 폴백하는지는 **순수 함수로 검증한다** — e2e 로 하려면 전역 참조 테이블(`lifestyle_content`)에 오염 행을 심어야 하고, 그건 모든 사용자가 보는 데이터다.

`src/lib/lifestyle-info/server.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toLifestyleTip } from './server.ts'

const base = { disease: '당뇨', topic: '식단', body_ko: '당뇨를 관리하는 분들께 일반적으로 도움이 된다고 알려져 있습니다.', sources: [] }

test('안전한 요약은 채택한다', () => {
  const tip = toLifestyleTip({ ...base, summary_ko: '당뇨를 관리하는 분들께 저탄수화물 식단이 도움이 된다고 알려져 있습니다.' })
  assert.ok(tip.summary_ko)
})

test('게이트에 걸린 요약은 버리고 본문은 남긴다', () => {
  // 개인 지시형 문구는 FORBIDDEN_PATTERNS 에 걸린다
  const tip = toLifestyleTip({ ...base, summary_ko: '지금 드시는 약을 중단하세요.' })
  assert.equal(tip.summary_ko, null)
  assert.equal(tip.body_ko, base.body_ko)   // 정보 자체는 사라지지 않는다
})

test('요약이 없으면 null', () => {
  assert.equal(toLifestyleTip({ ...base, summary_ko: null }).summary_ko, null)
})

test('url 없는 출처는 걸러낸다', () => {
  const tip = toLifestyleTip({ ...base, summary_ko: null, sources: [{ url: 'https://x' }, { url: '' }] })
  assert.equal(tip.sources.length, 1)
})
```

Run: `npm run test:unit` → FAIL (`toLifestyleTip` 없음)

- [ ] **Step 1: 타입과 조회를 고친다**

`src/lib/lifestyle-info/server.ts` 의 `LifestyleTip` 타입에 필드를 더한다:

```ts
export type LifestyleTip = {
  disease: string; topic: string; body_ko: string
  summary_ko: string | null   // 안전 게이트 통과분만. null 이면 본문을 편다
  sources: LifestyleSource[]
}
```

변환을 순수 함수로 뽑아 게이트 적용 지점을 한곳으로 만든다(Step 0 의 테스트 대상):

```ts
type LifestyleRow = {
  disease: string; topic: string; body_ko: string
  summary_ko: string | null; sources: unknown
}

/** 행 → 표시 모델. 요약은 본문과 같은 안전 게이트를 통과해야 채택된다. */
export function toLifestyleTip(r: LifestyleRow): LifestyleTip {
  return {
    disease: r.disease,
    topic: r.topic,
    body_ko: r.body_ko,
    // 실패하면 null → 화면은 본문을 편다. 요약이 걸렸다고 정보가 사라지면 안 된다.
    summary_ko: r.summary_ko && passesSafetyFrame(r.summary_ko) ? r.summary_ko : null,
    sources: ((r.sources as LifestyleSource[]) ?? []).filter((s) => s && s.url),
  }
}
```

`getLifestyleContent` 의 select 와 map 을 고친다:

```ts
    .select('disease, topic, body_ko, summary_ko, sources')
```

```ts
    .filter((r) => passesSafetyFrame(r.body_ko as string))
    .map((r) => toLifestyleTip(r as unknown as LifestyleRow))
```

- [ ] **Step 2: 카드 렌더를 고친다**

`src/app/(main)/@wallet/lifestyle-section.tsx` 상단에 import 를 더한다:

```ts
import { CollapsibleNote } from '@/components/yc/collapsible-note'
```

`:50-74` 의 카드 본문(`<p>{tip.body_ko}</p>` + 출처 블록)을 아래로 바꾼다. 출처 블록은 **그대로 유지**하되 요약이 있을 때는 접기 안으로 들어간다.

```tsx
{list.map((tip) => {
  const sourcesBlock = tip.sources.length > 0 && (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
      {tip.sources.slice(0, 3).map((s, i) => (
        <span key={s.pmid || i} className="inline-flex items-center gap-1">
          {s.grade && <EvidenceGradeBadge grade={s.grade} label={s.gradeLabel} />}
          <a
            href={/^https?:\/\//i.test(s.url ?? '') ? s.url : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-yc-green700 underline underline-offset-2 active:opacity-70"
          >
            근거 {i + 1} ↗
          </a>
        </span>
      ))}
    </div>
  )
  return (
    <YCCard key={tip.topic} variant="brand" className="px-5 py-4 space-y-2">
      <p className="text-sm font-bold text-yc-green700">{tip.topic}</p>
      {tip.summary_ko ? (
        <>
          <p className="text-base text-yc-neutral800 leading-relaxed break-keep">{tip.summary_ko}</p>
          <CollapsibleNote label="자세히 보기">
            <p className="text-base text-yc-neutral800 leading-relaxed break-keep">{tip.body_ko}</p>
            {sourcesBlock}
          </CollapsibleNote>
        </>
      ) : (
        <>
          <p className="text-base text-yc-neutral800 leading-relaxed break-keep">{tip.body_ko}</p>
          {sourcesBlock}
        </>
      )}
    </YCCard>
  )
})}
```

- [ ] **Step 3: 폴백 테스트가 통과하는지 확인한다**

Run: `npm run test:unit`
Expected: PASS — Step 0 의 4건 포함

- [ ] **Step 4: 타입 검사·린트·빌드**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 에러·워닝 0

- [ ] **Step 5: 커밋**

```bash
git add src/lib/lifestyle-info/server.ts src/lib/lifestyle-info/server.test.ts "src/app/(main)/@wallet/lifestyle-section.tsx"
git commit -m "feat(wallet): 생활관리 카드에 요약 + 자세히 보기

요약이 있으면 카드 기본은 요약이고, 펼치면 전문과 출처가 나온다.
요약이 없거나 안전 게이트에 걸린 행은 지금과 동일하게 본문을 편다.

<details> 를 써서 이 섹션은 서버 컴포넌트로 남는다 — 클라이언트로
바꾸면 번들과 하이드레이션이 는다."
```

---

### Task 6: 회귀 가드

**Files:**
- Modify: `e2e/wallet-signal-qa.mjs`

**Interfaces:**
- Consumes: Task 3·5 의 화면 변경
- Produces: 없음

- [ ] **Step 1: 접힘·펼침 단언을 추가한다**

`e2e/wallet-signal-qa.mjs` 의 `[E] 정보 패널 분류 정체성` 절 뒤에 붙인다. 픽스처는 기존 시드(어린이타이레놀산 202005623)를 그대로 쓴다.

```js
console.log('[J] 약 정보 패널 — 긴 필드는 접혀 있고, 펼치면 원문이 나온다')
// 기본 상태: 접힌 라벨은 보이고 본문은 안 보인다
const cautionToggle = tyCard.locator('summary', { hasText: '복용 전 확인할 것' }).first()
ok(await cautionToggle.isVisible().catch(() => false), '주의사항 접힘 라벨 표시')
const cautionBody = tyCard.locator('[data-quoted="mfds"]').first()
ok(!(await cautionBody.isVisible().catch(() => false)), '기본 상태에서 주의사항 본문 미노출')

// 터치 타겟
const sBox = await cautionToggle.boundingBox()
ok(!!sBox && sBox.height >= 44, `접힘 라벨 터치 타겟 44px+ (got ${Math.round(sBox?.height ?? 0)}px)`)

// 펼치면 본문이 나온다
await cautionToggle.click()
ok(await cautionBody.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false), '펼치면 주의사항 본문 표시')

// 앱이 쓴 문구에는 금칙어가 없다 — 원문 인용 블록은 제외한다
// (원문에는 용량 수치와 "복용하지 마십시오" 가 정당하게 들어 있다)
const appText = await tyCard.evaluate(el => {
  const clone = el.cloneNode(true)
  clone.querySelectorAll('[data-quoted="mfds"]').forEach(n => n.remove())
  return clone.textContent || ''
})
ok(!/안전|없습니다|검출되지/.test(appText), '앱 문구에 음성 판정 어휘 없음')
```

- [ ] **Step 2: 실행해 통과를 확인한다**

Run: `npm run build && npm run start` (별도 셸), 그다음 `node e2e/wallet-signal-qa.mjs`
Expected: PASS — 기존 33 + 신규 6 = 39단언

- [ ] **Step 3: 전체 게이트**

Run: `npm run test:unit && npm run lint && npx tsc --noEmit && npm run test:e2e`
Expected: unit 전체 PASS · lint 0 · tsc 0 · e2e 26스위트 PASS

- [ ] **Step 4: 커밋**

```bash
git add e2e/wallet-signal-qa.mjs
git commit -m "test(e2e): 약 정보 접힘·펼침 회귀 가드

기본 상태에서 주의사항 본문이 렌더되지 않고, 펼치면 원문이 나오며,
접힘 라벨이 44px 인지 잰다.

금칙어 스캔은 data-quoted=mfds 블록을 제거한 뒤 돌린다 — 원문에는
용량 수치와 '복용하지 마십시오' 가 정당하게 들어 있고 그것을 보여주는
것이 목적이다. 앱이 그 말을 하는 것과 원문을 인용하는 것은 다르다."
```

---

## 실행 순서 주의

- Task 4 → Task 5 사이에 **사람이 069 를 Supabase SQL Editor 에서 적용**해야 한다. 적용 전에 Task 5 를 배포하면 `summary_ko` 컬럼이 없어 `getLifestyleContent` 의 select 가 PostgREST 오류로 죽는다(2026-08-11 의 PGRST200 장애와 같은 유형).
- Task 4 의 재생성(`node scripts/gen-lifestyle-content.mjs`, --dry 없이)은 069 적용 후에 돌린다. 그 전까지 `summary_ko` 는 전 행 null 이고, 화면은 Task 5 의 폴백 경로(본문 표시)로 동작한다 — 즉 **부분 배포가 안전하다**.
- Task 1·2 는 서로 독립이고 Task 3 이 둘을 소비한다. Task 4·5 는 Task 1·3 과 독립이라 병렬 가능하다.
