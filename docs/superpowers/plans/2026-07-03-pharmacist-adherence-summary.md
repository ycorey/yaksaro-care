# 약사 환자 복약 기록 요약 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 약사 환자 상세 페이지에 "최근 복약 기록"(14일) 섹션을 추가해, 약사가 동의 단골 환자의 복약 기록 추세를 read-only로 본다.

**Architecture:** 순응 계산을 `lib/adherence.ts` 순수 함수로 추출(share·약사 공유). `medication_check_logs`에 약사 SELECT RLS(044) 추가. 상세 페이지가 약사 토큰+RLS로 14일 로그를 조회해 기록기준 요약을 렌더. service_role 우회 없음.

**Tech Stack:** Next.js 16 서버 컴포넌트 · Supabase(user 토큰+RLS) · Postgres RLS. 테스트: `node --experimental-strip-types --test`(Node 24 내장, 무의존성) + 실서버 e2e(supabase-js 임시데이터, 정리).

## Global Constraints

- 프레이밍 = **기록 기준**(기록한 날·총 체크·하루 평균). 순응률 % 금지. "미기록≠미복약" 문구 필수.
- 기간 = **14일**. `check_date`는 **UTC** 규약(캘린더/리포트와 동일).
- 보안: 약사 조회는 **user 토큰 + RLS만**. service_role 우회 금지. 가족(비-self) 멤버 로그 노출 금지.
- 새 **런타임** 의존성 0. 마이그레이션 044는 운영 DB 적용 필요.
- `@share` 30일 리포트 **동작 불변**(리팩터는 순수 추출일 뿐).

---

### Task 1: `summarizeAdherence` 순수 헬퍼 추출 + 단위테스트 (TDD)

**Files:**
- Create: `src/lib/adherence.ts`
- Create: `e2e/adherence-qa.mjs`
- Modify: `src/app/(main)/@share/report-view.tsx` (AdherenceSummary 타입 import로 전환)
- Modify: `src/app/(main)/@share/default.tsx` (인라인 계산 → 헬퍼 호출)

**Interfaces (Produces):**
- `type AdherenceSummary = { periodDays: number; recordedDays: number; checkedSlots: number; perDay: { date: string; done: number }[] }`
- `summarizeAdherence(logs: { check_date: string; meal_time: string; is_checked: boolean }[], periodDays: number, nowMs: number): AdherenceSummary`

- [ ] **Step 1: 실패 테스트 작성** — `e2e/adherence-qa.mjs`:

```js
// 복약 기록 요약(summarizeAdherence) 단위 테스트 — Node 내장 러너, 무의존성.
// 실행: node --experimental-strip-types --test e2e/adherence-qa.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeAdherence } from '../src/lib/adherence.ts'

// 기준 nowMs = 2026-07-14T00:00:00Z (UTC). periodDays=3 → 07-12,07-13,07-14
const NOW = Date.parse('2026-07-14T00:00:00Z')

test('빈 로그 → 전부 0', () => {
  const r = summarizeAdherence([], 3, NOW)
  assert.equal(r.periodDays, 3)
  assert.equal(r.recordedDays, 0)
  assert.equal(r.checkedSlots, 0)
  assert.deepEqual(r.perDay.map(d => d.done), [0, 0, 0])
  assert.deepEqual(r.perDay.map(d => d.date), ['2026-07-12', '2026-07-13', '2026-07-14'])
})

test('하루 2끼 체크 → done=2, recordedDays=1', () => {
  const logs = [
    { check_date: '2026-07-14', meal_time: 'morning', is_checked: true },
    { check_date: '2026-07-14', meal_time: 'evening', is_checked: true },
  ]
  const r = summarizeAdherence(logs, 3, NOW)
  assert.equal(r.recordedDays, 1)
  assert.equal(r.checkedSlots, 2)
  assert.equal(r.perDay.find(d => d.date === '2026-07-14').done, 2)
})

test('append-only: 같은 날·끼니 재체크는 최신 상태로 압축(체크→해제=0)', () => {
  const logs = [
    { check_date: '2026-07-13', meal_time: 'morning', is_checked: true },
    { check_date: '2026-07-13', meal_time: 'morning', is_checked: false },  // 나중 행=최신
  ]
  const r = summarizeAdherence(logs, 3, NOW)
  assert.equal(r.perDay.find(d => d.date === '2026-07-13').done, 0)
  assert.equal(r.recordedDays, 0)
})

test('잘못된 meal_time은 무시, bedtime은 유효(최대 4)', () => {
  const logs = ['morning', 'afternoon', 'evening', 'bedtime', 'brunch'].map(mt => ({
    check_date: '2026-07-12', meal_time: mt, is_checked: true,
  }))
  const r = summarizeAdherence(logs, 3, NOW)
  assert.equal(r.perDay.find(d => d.date === '2026-07-12').done, 4)
})

test('기간 밖 로그는 집계 제외', () => {
  const logs = [{ check_date: '2026-07-01', meal_time: 'morning', is_checked: true }]
  const r = summarizeAdherence(logs, 3, NOW)
  assert.equal(r.recordedDays, 0)
  assert.equal(r.perDay.length, 3)
})
```

- [ ] **Step 2: 실행 → 실패** — `node --experimental-strip-types --test e2e/adherence-qa.mjs` → FAIL(모듈 없음)

- [ ] **Step 3: 구현** — `src/lib/adherence.ts` (현 `@share/default.tsx` 59~99행 로직을 순수 추출):

```ts
import { isMeal } from './meal-slots'

export type AdherenceSummary = {
  periodDays:   number
  recordedDays: number                            // 기간 중 1회+ 체크한 날 수
  checkedSlots: number                            // 체크된 끼니 총합
  perDay:       { date: string; done: number }[]  // 각 날짜별 체크된 끼니 수(0~4)
}

const DAY = 86_400_000
const utcDate = (ms: number) => new Date(ms).toISOString().split('T')[0]

// append-only 로그 → (날짜,끼니)별 최신 상태 압축 → 일별 done 집계.
// logs는 logged_at 오름차순 전제(나중 행이 최신). check_date는 UTC 규약.
export function summarizeAdherence(
  logs: { check_date: string; meal_time: string; is_checked: boolean }[],
  periodDays: number,
  nowMs: number,
): AdherenceSummary {
  const startMs = nowMs - (periodDays - 1) * DAY

  const latestByDayMeal = new Map<string, Map<string, boolean>>()
  for (const row of logs) {
    if (!isMeal(row.meal_time)) continue
    let mm = latestByDayMeal.get(row.check_date)
    if (!mm) { mm = new Map(); latestByDayMeal.set(row.check_date, mm) }
    mm.set(row.meal_time, row.is_checked)
  }

  const perDay: { date: string; done: number }[] = []
  let recordedDays = 0
  let checkedSlots = 0
  for (let i = 0; i < periodDays; i++) {
    const d = utcDate(startMs + i * DAY)
    const mm = latestByDayMeal.get(d)
    let done = 0
    if (mm) for (const v of mm.values()) if (v) done++
    if (done > 0) { recordedDays++; checkedSlots += done }
    perDay.push({ date: d, done })
  }
  return { periodDays, recordedDays, checkedSlots, perDay }
}
```

- [ ] **Step 4: 실행 → 통과** — `node --experimental-strip-types --test e2e/adherence-qa.mjs` → `pass 5`

- [ ] **Step 5: report-view 타입 전환** — `src/app/(main)/@share/report-view.tsx`에서 `export type AdherenceSummary = {...}` 정의(9~14행)를 삭제하고 import로 교체:
```ts
import type { AdherenceSummary } from '@/lib/adherence'
```
(파일 내 `AdherenceSummary` 사용처는 그대로. `stripColor`·컴포넌트는 유지.)

- [ ] **Step 6: default.tsx 리팩터** — `src/app/(main)/@share/default.tsx`:
  - import 추가: `import { summarizeAdherence, type AdherenceSummary } from '@/lib/adherence'`
  - 기존 `import type { AdherenceSummary } from './report-view'` 제거(있다면).
  - 인라인 계산 블록(현 `const PERIOD = 30` ~ `const adherence: AdherenceSummary = {...}`, 약 61~99행)을 아래로 교체:
```ts
  // ── 최근 30일 복약 순응도 (medication_check_logs 기반) ──
  const nowMs = new Date().getTime()  // Date.now()는 react-hooks/purity가 렌더 중 차단
  const DAY = 86_400_000
  const utcDate = (ms: number) => new Date(ms).toISOString().split('T')[0]
  let logQ = supabase
    .from('medication_check_logs')
    .select('check_date, meal_time, is_checked, logged_at')
    .eq('user_id', user.id)
    .gte('check_date', utcDate(nowMs - 29 * DAY))
    .lte('check_date', utcDate(nowMs))
    .order('logged_at', { ascending: true })
  logQ = applyMemberScope(logQ, active)
  const { data: logs } = await logQ
  const adherence: AdherenceSummary = summarizeAdherence(logs ?? [], 30, nowMs)
```
  - `isMeal` import가 default.tsx에서 더 이상 쓰이지 않으면 제거(lint). `applyMemberScope`·기타는 유지.

- [ ] **Step 7: tsc·lint·build·회귀** — `npx tsc --noEmit`(0) · `npm run lint`(0) · `npm run build`(성공) · 단위테스트 재실행(pass 5).

- [ ] **Step 8: 커밋**
```bash
git add src/lib/adherence.ts e2e/adherence-qa.mjs "src/app/(main)/@share/report-view.tsx" "src/app/(main)/@share/default.tsx"
git commit -m "refactor(adherence): summarizeAdherence 순수 헬퍼 추출 + 단위테스트 (share 공유)"
```

---

### Task 2: 마이그레이션 044 — `medication_check_logs` 약사 SELECT RLS

**Files:**
- Create: `supabase/migrations/044_pharmacist_view_check_logs.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성** — `supabase/migrations/044_pharmacist_view_check_logs.sql`:

```sql
-- 044: 약사가 동의 단골 환자의 '본인(is_self)' 복약 체크 이력을 read-only로 조회.
-- 007의 본인 select/insert는 유지하고 약사 SELECT 정책만 추가.
-- 게이트: pharmacist_can_view(동의 AND 단골, 014) AND is_self_member(가족 로그 제외, 031).
-- 약사 토큰 + RLS만 — service_role 우회 없음.
drop policy if exists "mcl_pharmacist_view" on public.medication_check_logs;
create policy "mcl_pharmacist_view" on public.medication_check_logs
  for select using (
    public.pharmacist_can_view(user_id)
    and public.is_self_member(member_id)
  );
```

- [ ] **Step 2: (타입 영향 없음 확인)** — RLS 정책만 추가(컬럼 변경 없음) → `database.ts` 수정 불필요. `npx tsc --noEmit`(0).

- [ ] **Step 3: 커밋**
```bash
git add supabase/migrations/044_pharmacist_view_check_logs.sql
git commit -m "feat(pharmacy): 044 약사 SELECT RLS on medication_check_logs (동의+본인 게이트)"
```

> **운영 적용(승인 필요):** 코드 배포 전 `apply_migration`(project `tjtugyoexwsqaquheega`, name `pharmacist_view_check_logs`)로 044 적용. Task 4 보안 e2e는 적용 후 실행.

---

### Task 3: 상세 페이지 "최근 복약 기록" 섹션

**Files:**
- Create: `src/app/pharmacy/(app)/patients/[id]/pharmacy-adherence-section.tsx`
- Modify: `src/app/pharmacy/(app)/patients/[id]/page.tsx`

**Interfaces (Consumes):** `summarizeAdherence`, `AdherenceSummary` from `@/lib/adherence`

- [ ] **Step 1: 프레젠테이션 컴포넌트** — `pharmacy-adherence-section.tsx` (서버 렌더, 무상호작용):

```tsx
import { YCCard } from '@/components/yc/yc-card'
import type { AdherenceSummary } from '@/lib/adherence'

function stripColor(done: number): string {
  if (done <= 0) return 'bg-yc-neutral100'
  if (done === 1) return 'bg-yc-green100'
  if (done === 2) return 'bg-yc-green600/50'
  if (done === 3) return 'bg-yc-green600/80'
  return 'bg-yc-green700'
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-yc-md bg-yc-neutral50 px-3 py-3 text-center">
      <p className="font-display text-2xl text-yc-neutral900">{value}</p>
      <p className="text-xs text-yc-neutral500 mt-0.5">{label}</p>
    </div>
  )
}

// 약사용 환자 복약 기록 요약 — 기록 기준(순응률 % 아님). read-only.
export default function PharmacyAdherenceSection({ adherence }: { adherence: AdherenceSummary }) {
  const { periodDays, recordedDays, checkedSlots, perDay } = adherence
  const avgPerDay = recordedDays > 0 ? (checkedSlots / recordedDays).toFixed(1) : '0'
  const hasAny = checkedSlots > 0

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-yc-neutral900">최근 {periodDays}일 복약 기록</h2>
      <YCCard radius="lg" className="px-5 py-4 space-y-4">
        <p className="text-xs text-yc-neutral500">
          앱에 직접 기록한 날 기준이에요. 기록하지 않은 날의 복약 여부는 포함되지 않아요.
        </p>
        {hasAny ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label={`기록한 날 (${periodDays}일 중)`} value={`${recordedDays}일`} />
              <Stat label="총 복약 체크" value={`${checkedSlots}회`} />
              <Stat label="기록일 하루 평균" value={`${avgPerDay}회`} />
            </div>
            <div className="flex flex-wrap gap-1">
              {perDay.map(d => (
                <span key={d.date} title={`${d.date} · ${d.done}회`}
                  className={`w-4 h-4 rounded-[3px] ${stripColor(d.done)}`} />
              ))}
            </div>
            <p className="text-[11px] text-yc-neutral500">칸이 진할수록 그날 기록한 복약이 많아요</p>
          </>
        ) : (
          <p className="text-sm text-yc-neutral500 py-2">아직 복약 기록이 없어요</p>
        )}
      </YCCard>
    </div>
  )
}
```

- [ ] **Step 2: 상세 페이지에 로그 조회 + 섹션 렌더** — `patients/[id]/page.tsx`:
  - 상단 import 추가:
```ts
import { summarizeAdherence } from '@/lib/adherence'
import PharmacyAdherenceSection from './pharmacy-adherence-section'
```
  - `selfMemberId` 계산(현 91행) 이후, meds 조회 근처에 14일 로그 조회 추가:
```ts
  // 최근 14일 복약 기록(약사 토큰+RLS, 044 정책). self 멤버 있을 때만.
  const DAY = 86_400_000
  const nowMs = new Date().getTime()
  const utcDate = (ms: number) => new Date(ms).toISOString().split('T')[0]
  const { data: checkLogs } = selfMemberId
    ? await supabase
        .from('medication_check_logs')
        .select('check_date, meal_time, is_checked, logged_at')
        .eq('user_id', id)
        .eq('member_id', selfMemberId)
        .gte('check_date', utcDate(nowMs - 13 * DAY))
        .lte('check_date', utcDate(nowMs))
        .order('logged_at', { ascending: true })
    : { data: null }
  const adherence = summarizeAdherence(checkLogs ?? [], 14, nowMs)
```
  - 렌더에서 `<PatientNoteCard .../>` **다음**(약 148행)에 섹션 삽입(self 멤버 있을 때만):
```tsx
      {selfMemberId && <PharmacyAdherenceSection adherence={adherence} />}
```

- [ ] **Step 3: tsc·lint·build** — `npx tsc --noEmit`(0) · `npm run lint`(0) · `npm run build`(성공).

- [ ] **Step 4: 커밋**
```bash
git add "src/app/pharmacy/(app)/patients/[id]/pharmacy-adherence-section.tsx" "src/app/pharmacy/(app)/patients/[id]/page.tsx"
git commit -m "feat(pharmacy): 환자 상세에 최근 14일 복약 기록 섹션(기록기준·read-only)"
```

---

### Task 4: 보안 시나리오 e2e (044 운영 적용 후)

> **선행:** Task 2의 044가 운영 DB에 적용돼 있어야 함(승인). 미적용이면 건너뛰고 적용 후 실행.

**Files:**
- Create: `e2e/pharmacist-adherence-qa.mjs`

- [ ] **Step 1: 시나리오 e2e 작성** — `e2e/pharmacist-adherence-qa.mjs` (트리거/RLS 레벨, `qr-flow-sim.mjs`의 admin·loadEnv·세션 패턴 재사용):
  - 임시 약사 유저 + 약국(owner=약사) + 임시 환자 유저 생성.
  - 환자의 self 멤버 id 조회(handle_new_user가 self 멤버 생성) — 없으면 admin으로 생성. 가족(비-self) 멤버도 1개 생성.
  - admin으로 `medication_check_logs` 2건 삽입: self 멤버 것 1건 + 가족 멤버 것 1건(둘 다 user_id=환자).
  - **동의 OFF 상태**: 약사 세션 클라이언트로 `medication_check_logs` select(user_id=환자) → **0건**(pharmacist_can_view=false).
  - 환자 `profiles.consent_pharmacist_view=true` + `regular_pharmacy_id=약국`(단골) 세팅(admin).
  - **동의 ON**: 약사 세션 select(user_id=환자) → **self 멤버 로그만 1건**(가족 로그·비동의 제외 확인).
  - (대조) 타약국 약사 유저로 select → 0건.
  - finally: 로그·멤버·약국·유저 전량 삭제.

  세션 클라이언트는 `createClient(URL_, ANON)` + `signInWithPassword`로 유저 JWT 확보(pharmacy-due-qa.mjs 패턴).

- [ ] **Step 2: 실행** — `node e2e/pharmacist-adherence-qa.mjs`
  기대: 모든 체크 PASS(동의 전 0건 · 동의 후 self만 · 가족/타약국 0건), `[정리]` 로그.
  ⚠️ 운영 DB에 임시데이터 생성 후 전량 삭제. 실제 실행해 결과 확인. FAIL이면 그대로 보고(RLS 누수 가능).

- [ ] **Step 3: 커밋**
```bash
git add e2e/pharmacist-adherence-qa.mjs
git commit -m "test(pharmacy): 약사 체크로그 RLS 시나리오(동의+본인만 조회) e2e"
```

---

## Self-Review

**1. Spec coverage:**
- 044 약사 RLS(check_logs, 동의+본인) → Task 2. ✅
- summarizeAdherence 추출·share 공유(30일 불변) → Task 1. ✅
- 상세 14일 섹션(기록기준·히트맵·미기록≠미복약) → Task 3. ✅
- 검증(헬퍼 단위·보안 e2e·회귀) → Task 1·4. ✅
- 비목표(목록 카드·%·알림) → 계획에 없음. ✅
- service_role 우회 0 → 상세 페이지가 user supabase 클라만 사용(Task 3). ✅

**2. Placeholder scan:** 모든 스텝 실제 코드/명령/기대출력. Task 4는 서술형이나 재사용 패턴(qr-flow-sim·pharmacy-due-qa) 명시.

**3. Type/이름 일관성:** `summarizeAdherence(logs, periodDays, nowMs)`·`AdherenceSummary`가 Task 1 정의와 Task 3 사용처 일치. share·약사 동일 헬퍼. `is_self_member`·`pharmacist_can_view`는 기존 함수(031/014) 재사용.
