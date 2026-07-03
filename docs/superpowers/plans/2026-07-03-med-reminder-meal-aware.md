# 복약 알림 끼니 매칭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 복약 리마인더 크론이 사용자가 실제 등록한 약이 **있는 끼니에만** 푸시 알림을 보낸다.

**Architecture:** `lib/meal-slots.ts`에 `effectiveMealSlots(med)` 순수 헬퍼를 추가해 "이 약이 배정되는 끼니" 규칙을 홈/오늘 탭과 동일하게 SSOT화한다. 크론 route가 활성 약 조회에 `meal_times`·`doses_per_day`를 포함하고, `effectiveMealSlots`로 **이 끼니에 약이 있는 (user, member)만** 알림 대상에 넣는다. 기존 토글은 오버라이드로 그대로 유지.

**Tech Stack:** Next.js route handler(Node runtime) · Supabase admin client · web-push. 테스트: `node --experimental-strip-types --test` (Node 24 내장, 무의존성, DB/푸시 미접촉 순수함수 검증).

## Global Constraints

- 스키마 변경 없음 (마이그레이션 0)
- 설정 UI·끼니 토글 구조·크론 스케줄 시각·알림 문구 변경 없음
- 새 **런타임** 의존성 추가 없음 (테스트는 Node 내장 test runner 사용)
- 끼니 규칙 SSOT = `effectiveMealSlots`: `meal_times`(유효 `Meal`만) 있으면 그것, 없으면 `defaultMealKeys(doses_per_day ?? 0)` — 홈/오늘과 동일
- 크론은 실제 푸시를 발송하므로(운영 사용자 대상) **엔드포인트를 테스트에서 호출하지 않는다.** 검증은 순수 헬퍼 단위테스트 + `tsc`/`lint`/`build`로 한다.

---

### Task 1: `effectiveMealSlots` 순수 헬퍼 (TDD)

**Files:**
- Create: `e2e/meal-slots-qa.mjs`
- Modify: `src/lib/meal-slots.ts` (파일 끝, `defaultMealKeys` 다음에 함수 추가)

**Interfaces:**
- Produces: `effectiveMealSlots(med: { meal_times?: string[] | null; doses_per_day?: number | null }): Meal[]`
  - `Meal = 'morning' | 'afternoon' | 'evening' | 'bedtime'` (기존 export)

- [ ] **Step 1: 실패하는 테스트 작성**

Create `e2e/meal-slots-qa.mjs`:

```js
// 복약 알림 끼니 규칙(effectiveMealSlots) 단위 테스트 — Node 내장 러너, 무의존성.
// 실행: node --experimental-strip-types --test e2e/meal-slots-qa.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveMealSlots } from '../src/lib/meal-slots.ts'

test('meal_times 지정 → 그대로(유효 Meal만)', () => {
  assert.deepEqual(effectiveMealSlots({ meal_times: ['morning', 'evening'] }), ['morning', 'evening'])
})
test('meal_times 빈값 + 1회 → 아침', () => {
  assert.deepEqual(effectiveMealSlots({ meal_times: [], doses_per_day: 1 }), ['morning'])
})
test('meal_times 빈값 + 2회 → 아침·저녁', () => {
  assert.deepEqual(effectiveMealSlots({ meal_times: [], doses_per_day: 2 }), ['morning', 'evening'])
})
test('meal_times 빈값 + 3회 → 아침·점심·저녁', () => {
  assert.deepEqual(effectiveMealSlots({ meal_times: [], doses_per_day: 3 }), ['morning', 'afternoon', 'evening'])
})
test('meal_times·doses 모두 없음 → 아침·점심·저녁(폴백 0)', () => {
  assert.deepEqual(effectiveMealSlots({}), ['morning', 'afternoon', 'evening'])
})
test('meal_times에 잘못된 값 섞임 → 유효 Meal만', () => {
  assert.deepEqual(effectiveMealSlots({ meal_times: ['morning', 'brunch', 'bedtime'] }), ['morning', 'bedtime'])
})
test('시나리오: 아침·저녁 약 → 점심/자기전은 알림 대상 아님', () => {
  const slots = effectiveMealSlots({ meal_times: ['morning', 'evening'] })
  assert.equal(slots.includes('afternoon'), false)
  assert.equal(slots.includes('bedtime'), false)
  assert.equal(slots.includes('morning'), true)
  assert.equal(slots.includes('evening'), true)
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --experimental-strip-types --test e2e/meal-slots-qa.mjs`
Expected: FAIL — `effectiveMealSlots is not a function` (또는 export 없음 SyntaxError)

- [ ] **Step 3: 최소 구현**

Modify `src/lib/meal-slots.ts` — 파일 맨 끝(`defaultMealKeys` 함수 뒤)에 추가:

```ts

// 이 약이 실제 배정되는 끼니(홈/오늘/알림 공용 SSOT).
// meal_times가 있으면 유효한 Meal만, 없으면 복용횟수 기반 기본 슬롯으로 폴백.
export function effectiveMealSlots(
  med: { meal_times?: string[] | null; doses_per_day?: number | null },
): Meal[] {
  const explicit = (med.meal_times ?? []).filter(isMeal)
  return explicit.length > 0 ? explicit : defaultMealKeys(med.doses_per_day ?? 0)
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --experimental-strip-types --test e2e/meal-slots-qa.mjs`
Expected: PASS — `pass 7  fail 0`

- [ ] **Step 5: 타입·린트 확인 (테스트/헬퍼가 앱 컴파일에 지장 없음)**

Run: `npx tsc --noEmit 2>&1 | head -5; echo "TSC_EXIT=${PIPESTATUS[0]}"`
Expected: `TSC_EXIT=0` (에러 0)
Run: `npm run lint 2>&1 | tail -3`
Expected: 에러 0 (`e2e/*.mjs`는 기존과 동일 취급)

- [ ] **Step 6: 커밋**

```bash
git add src/lib/meal-slots.ts e2e/meal-slots-qa.mjs
git commit -m "feat(reminder): effectiveMealSlots 헬퍼 — 약이 배정되는 끼니 SSOT + 단위테스트"
```

---

### Task 2: 크론에 끼니 매칭 필터 적용

**Files:**
- Modify: `src/app/api/cron/medication-reminders/route.ts`
  - import 라인 (4행 근처)
  - 활성 약 조회 `select` (72–76행 근처)
  - 활성 멤버 집계 루프 (80–85행 근처)

**Interfaces:**
- Consumes: `effectiveMealSlots` (Task 1) from `@/lib/meal-slots`

- [ ] **Step 1: import에 `effectiveMealSlots` 추가**

`src/app/api/cron/medication-reminders/route.ts` 4행:

```ts
import { MEAL_LABELS, MEAL_TIMES, isMeal, effectiveMealSlots } from '@/lib/meal-slots'
```

(기존: `import { MEAL_LABELS, MEAL_TIMES, isMeal } from '@/lib/meal-slots'`)

- [ ] **Step 2: 활성 약 조회에 `meal_times, doses_per_day` 추가**

같은 파일 활성 약 쿼리의 `.select(...)`:

```ts
  const { data: active } = await admin
    .from('user_medications')
    .select('user_id, member_id, schedule_type, dow, meal_times, doses_per_day')
    .in('user_id', pushUsers)
    .is('deleted_at', null).is('ended_at', null)
```

(기존 select: `'user_id, member_id, schedule_type, dow'`)

- [ ] **Step 3: 집계 루프에 끼니 매칭 가드 추가**

같은 파일 `for (const m of active ?? [])` 루프에서 `isScheduledOnWeekday` 가드 **바로 다음 줄**에 추가:

```ts
  for (const m of active ?? []) {
    if (!isScheduledOnWeekday(m, wd)) continue
    if (!effectiveMealSlots(m).includes(meal)) continue   // 이 끼니에 실제 배정된 약만
    const u = m.user_id as string
    if (!activeMembersByUser.has(u)) activeMembersByUser.set(u, new Set())
    activeMembersByUser.get(u)!.add(m.member_id as string | null)
  }
```

(추가 라인은 `if (!effectiveMealSlots(m).includes(meal)) continue` 한 줄. `meal`은 상단에서 `isMeal` 가드를 통과한 `Meal` 값.)

- [ ] **Step 4: 타입·린트·빌드 확인**

Run: `npx tsc --noEmit 2>&1 | head -8; echo "TSC_EXIT=${PIPESTATUS[0]}"`
Expected: `TSC_EXIT=0`
Run: `npm run lint 2>&1 | tail -3`
Expected: 에러 0
Run: `npm run build 2>&1 | tail -4`
Expected: 빌드 성공(에러 0)

- [ ] **Step 5: 회귀 확인 (Task 1 테스트 재실행)**

Run: `node --experimental-strip-types --test e2e/meal-slots-qa.mjs`
Expected: PASS — `pass 7  fail 0`

> **주의:** 크론 엔드포인트(`/api/cron/medication-reminders`)는 운영 사용자에게 실제 푸시를 보내므로 로컬/운영 어디서도 테스트 호출하지 않는다. 새 동작(끼니 매칭)의 결정 로직은 Task 1 단위테스트가 전수 커버하고, 라우트 변경은 조회 필드 추가 + 가드 한 줄이라 `tsc`/`lint`/`build` + 코드리뷰로 검증한다.

- [ ] **Step 6: 커밋**

```bash
git add "src/app/api/cron/medication-reminders/route.ts"
git commit -m "feat(reminder): 약이 있는 끼니에만 알림 — 크론 끼니 매칭 필터"
```

---

## Self-Review

**1. Spec coverage:**
- "약 있는 끼니에만 알림" → Task 2 Step 3 가드 + Task 1 헬퍼. ✅
- 기존 토글 오버라이드 유지 → 크론의 `allowedSet`(alarm_enabled + alarm_times) 로직 미변경. ✅
- `effectiveMealSlots` 헬퍼(SSOT) → Task 1. ✅
- 엣지(폴백·PRN·weekly) → 헬퍼 폴백 + 기존 `isScheduledOnWeekday` 유지. Task 1 테스트가 폴백 케이스 커버. ✅
- 스키마·UI·스케줄·문구 무변경 → 어느 태스크도 건드리지 않음. ✅
- 선택 2건 제외 → 계획에 포함 안 함. ✅

**2. Placeholder scan:** 모든 스텝에 실제 코드/명령/기대출력 포함. 없음.

**3. Type consistency:** `effectiveMealSlots` 시그니처가 Task 1 정의와 Task 2 사용처 일치(`{ meal_times?: string[] | null; doses_per_day?: number | null } → Meal[]`). `meal: Meal`이 `Meal[].includes`에 정합.
