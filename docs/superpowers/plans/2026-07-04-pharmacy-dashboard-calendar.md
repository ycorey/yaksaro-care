# 약사 대시보드 재구성 (캘린더 + 현황판 + 환자별 요청 아코디언) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 약사 대시보드를 좌=캘린더+현황판 / 우=환자목록(요청이 각 환자 아코디언으로 귀속·새 요청 시 깜박임)으로 재구성한다.

**Architecture:** 순수 파생 로직(캘린더 항목·오늘 할 일·리필)은 `src/lib/`에 테스트 가능한 함수로 두고, 표시는 클라이언트 컴포넌트가 담당한다. 요청함 단독 패널을 은퇴시키고 요청 카드를 공용 컴포넌트로 추출해 환자 목록 아코디언에 재사용한다. 유일한 신규 저장은 수동 메모(`pharmacy_todos`, 마이그 045)뿐이고 나머지는 기존 데이터·헬퍼를 재사용한다.

**Tech Stack:** Next.js 16.2.6(App Router, RSC) · Supabase(user 토큰 + RLS) · Tailwind v4 + YC 토큰 · Phosphor 아이콘 · Node 내장 테스트 러너(`node --experimental-strip-types --test`).

## Global Constraints

- Next.js **16.2.6** — 미들웨어는 `src/proxy.ts`. 새 의존성 추가 금지(package.json 불변).
- 모든 앱 조회는 **사용자(약사) 토큰 + RLS** — `service_role`(admin 클라이언트) 앱 경로 사용 금지.
- 애니메이션은 **`transform`/`opacity`만**. `prefers-reduced-motion` 기존 전역 블록이 자동 무력화(추가 코드 불필요).
- Supabase **`select('*')` 금지** — 소비 컬럼만 명시. 목록은 `limit`.
- **가족 격리**: 요청 카드는 `isFamily` 플래그만 표기(가족 이름·약명 비노출). 복약 카운트·리필은 본인(`is_self`) 멤버만.
- 규제 면책 문구("읽기 전용", "의학적 판단 대체 아님") 하단 유지. 답장은 예약·물류 안내용.
- 색은 YC 토큰만(하드코딩 hex 금지). 카드=`YCCard`.
- 회귀 게이트: `npx tsc --noEmit` · `npm run lint` · `npm run build` 통과.
- 테스트 실행: `node --experimental-strip-types --test e2e/<name>-qa.mjs` (순수 함수) / `node e2e/<name>-qa.mjs` (RLS 시나리오).

---

## File Structure

**신규**
- `supabase/migrations/045_pharmacy_todos.sql` — 수동 메모 테이블 + RLS.
- `src/lib/pharmacy-board.ts` — 순수 파생: 타입(`InboxRow`,`ReqStatus`,`AutoTask`,`CalendarItem`), `TYPE_LABEL`, `deriveTodayAutoTasks`, `buildCalendarItems`, `monthGridDays`.
- `src/app/api/pharmacy/todo/route.ts` — 수동 메모 CRUD(GET/POST/PATCH/DELETE).
- `src/app/pharmacy/(app)/pharmacy-request-card.tsx` — 요청 1건 카드(답장·전화·마감·완료). 인박스에서 추출.
- `src/app/pharmacy/(app)/pharmacy-calendar.tsx` — 월 그리드 + 점 + 날짜탭 목록.
- `src/app/pharmacy/(app)/pharmacy-todo-list.tsx` — 수동 메모 CRUD UI.
- `src/app/pharmacy/(app)/pharmacy-status-board.tsx` — 4블록 컨테이너.
- `e2e/refill-qa.mjs` · `e2e/pharmacy-board-qa.mjs` · `e2e/pharmacy-todo-qa.mjs` — 테스트.

**수정**
- `src/lib/refill.ts` — `RefillItem`에 `expiryDate`(ISO) 추가.
- `src/app/pharmacy/(app)/pharmacy-patient-list.tsx` — 아코디언 + 깜박임 + `?focus=` 자동 펼침.
- `src/app/pharmacy/(app)/page.tsx` — 쿼리 확장·데이터 조립·레이아웃 뒤바꿈.
- `src/app/globals.css` — `@keyframes ycRequestBlink` + 유틸 클래스.

**삭제**
- `src/app/pharmacy/(app)/pharmacy-request-inbox.tsx` — 카드 추출 후 제거(Task 9).

---

## Task 1: 마이그레이션 045 — `pharmacy_todos` 테이블 + RLS

**Files:**
- Create: `supabase/migrations/045_pharmacy_todos.sql`

**Interfaces:**
- Produces: 테이블 `public.pharmacy_todos(id, pharmacy_id, text, done, created_at, done_at)` + RLS 정책 `pharmacy_todos_owner_all`. Task 4(API)·Task 8(TodoList)이 의존.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/045_pharmacy_todos.sql`:

```sql
-- 045: 약국 내부용 수동 '오늘 할 일' 메모. 환자 비노출. 약국 owner(약사 본인)만 전권.
-- 약사 토큰 + RLS만 — service_role 우회 없음.
create table if not exists public.pharmacy_todos (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create index if not exists idx_pharmacy_todos_pharmacy
  on public.pharmacy_todos (pharmacy_id, done, created_at desc);

alter table public.pharmacy_todos enable row level security;

drop policy if exists pharmacy_todos_owner_all on public.pharmacy_todos;
create policy pharmacy_todos_owner_all on public.pharmacy_todos
  for all
  using  (pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid()))
  with check (pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid()));
```

- [ ] **Step 2: 운영 DB 적용 (MCP 승인 게이트)**

Supabase MCP `apply_migration`(name=`045_pharmacy_todos`, query=위 SQL)로 적용. **분류기가 자동 적용을 차단하므로 사용자 명시 승인 후 통과**시킨다. 적용 후 `list_migrations`로 045 반영 확인.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/045_pharmacy_todos.sql
git commit -m "feat(pharmacy): pharmacy_todos 마이그(045) — 약국 수동 메모 + owner RLS"
```

---

## Task 2: `refill.ts` — 만료일 ISO 필드 추가

**Files:**
- Modify: `src/lib/refill.ts` (`RefillItem` 타입, `computeRefillSoon` 반환)
- Test: `e2e/refill-qa.mjs`

**Interfaces:**
- Consumes: 기존 `computeRefillSoon(meds)`.
- Produces: `RefillItem`에 `expiryDate: string`('YYYY-MM-DD') 추가. Task 3·7·10에서 캘린더/리필 블록에 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`e2e/refill-qa.mjs`:

```js
// 리필 계산 단위 테스트 — Node 내장 러너, 무의존성.
// 실행: node --experimental-strip-types --test e2e/refill-qa.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeRefillSoon } from '../src/lib/refill.ts'

// 오늘 기준 만료 3일 뒤가 되도록 처방일 = 오늘-(28-3)=오늘-25일, 총 28일
function iso(offsetDays) {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

test('만료 3일 전 처방 → 리필 대상 + expiryDate가 ISO(YYYY-MM-DD)', () => {
  const items = computeRefillSoon([
    { total_days: 28, custom_name: '혈압약', prescription: { id: 'p1', prescribed_at: iso(-25), duration_days: 28, hospital_name: '내과' } },
  ])
  assert.equal(items.length, 1)
  assert.match(items[0].expiryDate, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(items[0].expiryDate, iso(3))
  assert.equal(items[0].dDay, 3)
})

test('28일 미만 처방 → 대상 아님', () => {
  const items = computeRefillSoon([
    { total_days: 7, custom_name: '감기약', prescription: { id: 'p2', prescribed_at: iso(-5), duration_days: 7, hospital_name: '이비인후과' } },
  ])
  assert.equal(items.length, 0)
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --experimental-strip-types --test e2e/refill-qa.mjs`
Expected: FAIL — `items[0].expiryDate`가 `undefined`(아직 필드 없음).

- [ ] **Step 3: `refill.ts` 수정**

`RefillItem` 타입에 필드 추가(`expiryLabel` 다음 줄):

```ts
export type RefillItem = {
  id: string
  label: string        // 병원명 또는 '처방약'
  dDay: number         // 만료까지 남은 일(0~5)
  expiryLabel: string  // "7월 1일"
  expiryDate: string   // "2026-07-01" (ISO, 캘린더 점용)
  medNames: string[]
}
```

`computeRefillSoon` 내부 `items.push({ ... })`를 만료 ISO 포함으로 교체:

```ts
    const y = exp.getFullYear()
    const mm = String(exp.getMonth() + 1).padStart(2, '0')
    const dd = String(exp.getDate()).padStart(2, '0')
    items.push({
      id: presc.id!,
      label: presc.hospital_name ?? '처방약',
      dDay,
      expiryLabel: `${exp.getMonth() + 1}월 ${exp.getDate()}일`,
      expiryDate: `${y}-${mm}-${dd}`,
      medNames,
    })
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --experimental-strip-types --test e2e/refill-qa.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/refill.ts e2e/refill-qa.mjs
git commit -m "feat(refill): RefillItem에 expiryDate(ISO) 추가 — 캘린더 점용 + 단위테스트"
```

---

## Task 3: `pharmacy-board.ts` — 순수 파생 로직 + 공용 타입

**Files:**
- Create: `src/lib/pharmacy-board.ts`
- Test: `e2e/pharmacy-board-qa.mjs`

**Interfaces:**
- Consumes: `bucketByDue`(`src/lib/request-schedule.ts`).
- Produces:
  - `type ReqStatus = 'open'|'acknowledged'|'done'|'canceled'`
  - `type InboxRow = { id; type; note; contact_phone; status; created_at; due_date; patientName; isFamily?; replyText?; repliedAt?; patientAckAt?; patientId? }`
  - `const TYPE_LABEL: Record<string,string>`
  - `type AutoTask = { id: string; kind: 'reply_pending'|'due_today'|'refill_today'; label: string; patientId: string }`
  - `deriveTodayAutoTasks(params): AutoTask[]`
  - `type CalendarItem = { date: string; kind: 'request'|'refill'; label: string }`
  - `buildCalendarItems(requests, refills): CalendarItem[]`
  - `monthGridDays(today: string): (string|null)[]`
  - Task 4·6·7·8·10·11이 이 모듈에서 타입/함수를 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`e2e/pharmacy-board-qa.mjs`:

```js
// 약사 대시보드 파생 로직 단위 테스트 — Node 내장 러너, 무의존성.
// 실행: node --experimental-strip-types --test e2e/pharmacy-board-qa.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveTodayAutoTasks, buildCalendarItems, monthGridDays } from '../src/lib/pharmacy-board.ts'

const TODAY = '2026-07-15'

test('오늘 할 일: open+미답장 → reply_pending', () => {
  const t = deriveTodayAutoTasks({
    requests: [{ id: 'r1', patientId: 'u1', patientName: '김상우', status: 'open', due_date: '2026-07-20', replyText: null }],
    refillsToday: [], today: TODAY,
  })
  assert.equal(t.length, 1)
  assert.equal(t[0].kind, 'reply_pending')
  assert.equal(t[0].patientId, 'u1')
})

test('오늘 할 일: 답장했지만 오늘 마감 → due_today', () => {
  const t = deriveTodayAutoTasks({
    requests: [{ id: 'r2', patientId: 'u2', patientName: '이영희', status: 'acknowledged', due_date: TODAY, replyText: '오후 픽업' }],
    refillsToday: [], today: TODAY,
  })
  assert.equal(t.length, 1)
  assert.equal(t[0].kind, 'due_today')
})

test('오늘 할 일: 완료 요청은 제외', () => {
  const t = deriveTodayAutoTasks({
    requests: [{ id: 'r3', patientId: 'u3', patientName: '박', status: 'done', due_date: TODAY, replyText: null }],
    refillsToday: [], today: TODAY,
  })
  assert.equal(t.length, 0)
})

test('오늘 할 일: 오늘 리필 → refill_today', () => {
  const t = deriveTodayAutoTasks({
    requests: [], refillsToday: [{ patientId: 'u4', patientName: '최' }], today: TODAY,
  })
  assert.equal(t.length, 1)
  assert.equal(t[0].kind, 'refill_today')
  assert.equal(t[0].patientId, 'u4')
})

test('캘린더 항목: null 날짜 제외 + 날짜순 정렬 + kind 태깅', () => {
  const items = buildCalendarItems(
    [{ date: '2026-07-20', label: '김 전화요청' }, { date: null, label: '무마감' }],
    [{ date: '2026-07-18', label: '이 리필' }],
  )
  assert.equal(items.length, 2)
  assert.equal(items[0].date, '2026-07-18')
  assert.equal(items[0].kind, 'refill')
  assert.equal(items[1].kind, 'request')
})

test('월 그리드: 7일 배수 + 1일~말일 포함 + 첫 비어있지 않은 칸=1일', () => {
  const cells = monthGridDays('2026-07-15')
  assert.equal(cells.length % 7, 0)
  assert.equal(cells.filter(Boolean).length, 31)
  assert.equal(cells.find(Boolean), '2026-07-01')
  assert.ok(cells.includes('2026-07-31'))
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --experimental-strip-types --test e2e/pharmacy-board-qa.mjs`
Expected: FAIL — 모듈 없음(`Cannot find module '../src/lib/pharmacy-board.ts'`).

- [ ] **Step 3: `pharmacy-board.ts` 작성**

`src/lib/pharmacy-board.ts`:

```ts
// 약사 대시보드 순수 파생 로직 + 공용 타입. UI 무관·테스트 가능.
import { bucketByDue } from './request-schedule'

export type ReqStatus = 'open' | 'acknowledged' | 'done' | 'canceled'

// 환자 요청 1건(약사가 처리). 카드·목록·페이지 공용.
export type InboxRow = {
  id: string
  type: string
  note: string | null
  contact_phone: string | null
  status: ReqStatus
  created_at: string
  due_date: string | null
  patientName: string | null
  isFamily?: boolean
  replyText?: string | null
  repliedAt?: string | null
  patientAckAt?: string | null
  patientId?: string
}

export const TYPE_LABEL: Record<string, string> = {
  callback: '전화 요청', dispense_prep: '조제 미리 준비', pickup: '픽업 예약',
  consult_booking: '상담 예약', stock_inquiry: '재고 문의',
}

export type AutoTask = {
  id: string
  kind: 'reply_pending' | 'due_today' | 'refill_today'
  label: string
  patientId: string
}

type DeriveParams = {
  requests: { id: string; patientId: string; patientName: string; status: ReqStatus; due_date: string | null; replyText?: string | null }[]
  refillsToday: { patientId: string; patientName: string }[]
  today: string
}

// '오늘 할 일'의 자동 파생분. 완료·취소 요청은 제외.
export function deriveTodayAutoTasks({ requests, refillsToday, today }: DeriveParams): AutoTask[] {
  const tasks: AutoTask[] = []
  for (const r of requests) {
    if (r.status !== 'open' && r.status !== 'acknowledged') continue
    if (r.status === 'open' && !r.replyText) {
      tasks.push({ id: r.id, kind: 'reply_pending', label: `${r.patientName} · 요청 답장 대기`, patientId: r.patientId })
    } else if (bucketByDue(r.due_date, today) === 'today') {
      tasks.push({ id: r.id, kind: 'due_today', label: `${r.patientName} · 오늘 마감`, patientId: r.patientId })
    }
  }
  for (const f of refillsToday) {
    tasks.push({ id: `refill-${f.patientId}`, kind: 'refill_today', label: `${f.patientName} · 오늘 리필`, patientId: f.patientId })
  }
  return tasks
}

export type CalendarItem = { date: string; kind: 'request' | 'refill'; label: string }

// 요청 마감·리필 만료를 캘린더 항목으로. null 날짜 제외 후 날짜순.
export function buildCalendarItems(
  requests: { date: string | null; label: string }[],
  refills: { date: string | null; label: string }[],
): CalendarItem[] {
  const items: CalendarItem[] = []
  for (const r of requests) if (r.date) items.push({ date: r.date, kind: 'request', label: r.label })
  for (const r of refills) if (r.date) items.push({ date: r.date, kind: 'refill', label: r.label })
  return items.sort((a, b) => a.date.localeCompare(b.date))
}

// today('YYYY-MM-DD')가 속한 달의 그리드 셀(일요일 시작). 앞뒤 빈칸은 null, 길이는 7의 배수.
export function monthGridDays(today: string): (string | null)[] {
  const [y, m] = today.split('-').map(Number)
  const startDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay() // 0=일
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --experimental-strip-types --test e2e/pharmacy-board-qa.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/pharmacy-board.ts e2e/pharmacy-board-qa.mjs
git commit -m "feat(pharmacy): 대시보드 파생 로직 lib(오늘할일·캘린더·월그리드) + 단위테스트"
```

---

## Task 4: `/api/pharmacy/todo` 라우트 + RLS e2e

**Files:**
- Create: `src/app/api/pharmacy/todo/route.ts`
- Test: `e2e/pharmacy-todo-qa.mjs`

**Interfaces:**
- Consumes: `pharmacy_todos`(Task 1), `createClient`(`@/lib/supabase/server`).
- Produces: HTTP `GET`(목록) · `POST {text}` · `PATCH {id,done}` · `DELETE {id}`. Task 8(TodoList)이 fetch로 소비. 응답: GET→`{ todos: {id,text,done,created_at}[] }`, 나머지→`{ ok:true }` 또는 `{ todo }`.

- [ ] **Step 1: 라우트 작성**

`src/app/api/pharmacy/todo/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 약국 수동 '오늘 할 일' 메모 CRUD. 사용자(약사) 토큰 + RLS(owner 약국만). service_role 미사용.
async function ownedPharmacyId(supabase: Awaited<ReturnType<typeof createClient>>, uid: string) {
  const { data } = await supabase.from('pharmacies').select('id').eq('owner_id', uid).maybeSingle()
  return data?.id ?? null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  // RLS가 owner 약국으로 스코핑 — 미완료 전체 + 최근 완료 10건까지
  const { data, error } = await supabase
    .from('pharmacy_todos')
    .select('id, text, done, created_at')
    .order('done', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ todos: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const { text } = await request.json().catch(() => ({})) as { text?: string }
  const t = (text ?? '').trim()
  if (!t || t.length > 200) return NextResponse.json({ error: '1~200자로 입력해주세요' }, { status: 400 })
  const pharmacyId = await ownedPharmacyId(supabase, user.id)
  if (!pharmacyId) return NextResponse.json({ error: '약국 권한이 없어요' }, { status: 403 })
  const { data, error } = await supabase
    .from('pharmacy_todos')
    .insert({ pharmacy_id: pharmacyId, text: t })
    .select('id, text, done, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ todo: data })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const { id, done } = await request.json().catch(() => ({})) as { id?: string; done?: boolean }
  if (!id || typeof done !== 'boolean') return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  // RLS가 owner 약국 행만 허용
  const { error } = await supabase
    .from('pharmacy_todos')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const { id } = await request.json().catch(() => ({})) as { id?: string }
  if (!id) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  const { error } = await supabase.from('pharmacy_todos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: RLS 보안 e2e 작성**

`e2e/pharmacy-todo-qa.mjs`:

```js
// pharmacy_todos RLS 시나리오 — 약국 owner만 CRUD. 타 약사 조회/수정 0건.
// 운영 Supabase에 임시 약사 2명 + 약국 2개 생성 → 검증 → finally 전량 삭제.
// 실행: node e2e/pharmacy-todo-qa.mjs
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'

const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const results = []
const check = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`) }

const now = Date.now()
const pw = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'
const aEmail = `e2e-todo-a+${now}@yaksaro-e2e.test`
const bEmail = `e2e-todo-b+${now}@yaksaro-e2e.test`
let aUid = null, bUid = null, pharmA = null, pharmB = null, todoId = null

async function signed(email) {
  const c = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: pw })
  if (error) throw new Error('signIn ' + email + ': ' + error.message)
  return c
}

try {
  const mk = async (email) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })
    if (error) throw new Error('createUser ' + email + ': ' + error.message)
    return data.user.id
  }
  aUid = await mk(aEmail); bUid = await mk(bEmail)
  const mkPharm = async (owner, sfx) => {
    const { data, error } = await admin.from('pharmacies').insert({ owner_id: owner, name: 'E2E약국' + sfx, store_id: `e2e-todo-${sfx}-${now}` }).select('id').single()
    if (error) throw new Error('pharmacy ' + sfx + ': ' + error.message)
    return data.id
  }
  pharmA = await mkPharm(aUid, 'A'); pharmB = await mkPharm(bUid, 'B')

  const aC = await signed(aEmail)
  const bC = await signed(bEmail)

  // T1: 약사A가 자기 약국 메모 생성
  const { data: ins, error: insErr } = await aC.from('pharmacy_todos').insert({ pharmacy_id: pharmA, text: '재고 확인' }).select('id').single()
  check('약사A: 자기 약국 메모 생성', !insErr && !!ins?.id, insErr?.message)
  todoId = ins?.id ?? null

  // T2: 약사A 조회 1건
  const { data: aList } = await aC.from('pharmacy_todos').select('id').eq('pharmacy_id', pharmA)
  check('약사A: 자기 메모 1건 조회', (aList ?? []).length === 1, `len=${(aList ?? []).length}`)

  // T3: 약사B가 A약국 메모 조회 0건(RLS 차단)
  const { data: bSee } = await bC.from('pharmacy_todos').select('id').eq('pharmacy_id', pharmA)
  check('약사B: 타약국 메모 0건', (bSee ?? []).length === 0, `len=${(bSee ?? []).length}`)

  // T4: 약사B가 A약국에 메모 삽입 시도 → with check 위반(0행/에러)
  const { data: bIns, error: bInsErr } = await bC.from('pharmacy_todos').insert({ pharmacy_id: pharmA, text: '침투' }).select('id')
  check('약사B: 타약국 삽입 차단', !!bInsErr || (bIns ?? []).length === 0, bInsErr?.message ?? 'no error but 0 rows')

  // T5: 약사B가 A의 메모 삭제 시도 → RLS로 0행 삭제(남아있어야 함)
  if (todoId) await bC.from('pharmacy_todos').delete().eq('id', todoId)
  const { data: still } = await aC.from('pharmacy_todos').select('id').eq('id', todoId)
  check('약사B: 타약국 메모 삭제 불가(잔존)', (still ?? []).length === 1, `len=${(still ?? []).length}`)
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  if (pharmA) await admin.from('pharmacy_todos').delete().eq('pharmacy_id', pharmA)
  if (pharmB) await admin.from('pharmacy_todos').delete().eq('pharmacy_id', pharmB)
  if (pharmA) await admin.from('pharmacies').delete().eq('id', pharmA)
  if (pharmB) await admin.from('pharmacies').delete().eq('id', pharmB)
  for (const uid of [aUid, bUid]) { if (uid) { await admin.from('members').delete().eq('owner_id', uid); await admin.auth.admin.deleteUser(uid) } }
  console.log('\n[정리] 임시 약사·약국·메모 삭제 완료')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== pharmacy_todos RLS: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
```

- [ ] **Step 3: 타입 생성 반영 + 타입체크**

`pharmacy_todos`가 `src/types/database.ts`에 없으므로 Supabase MCP `generate_typescript_types`로 재생성해 파일을 덮어쓴다(또는 수동으로 `pharmacy_todos` Row/Insert/Update 블록 추가). 그 뒤:

Run: `npx tsc --noEmit`
Expected: 에러 0 (라우트가 `pharmacy_todos`를 인식).

- [ ] **Step 4: RLS e2e 실행**

Run: `node e2e/pharmacy-todo-qa.mjs`
Expected: `5/5 PASS`.

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/pharmacy/todo/route.ts e2e/pharmacy-todo-qa.mjs src/types/database.ts
git commit -m "feat(pharmacy): 수동 메모 CRUD API + RLS 보안 e2e(5/5)"
```

---

## Task 5: 요청 카드 공용 컴포넌트 추출 (`pharmacy-request-card.tsx`)

**Files:**
- Create: `src/app/pharmacy/(app)/pharmacy-request-card.tsx`

**Interfaces:**
- Consumes: `InboxRow`, `ReqStatus`, `TYPE_LABEL`(`@/lib/pharmacy-board`), `bucketByDue`(`@/lib/request-schedule`), `YCCard`.
- Produces: `<PharmacyRequestCard row today onChange />` — `onChange(updated: InboxRow)`로 갱신 통지. Task 7(목록)이 환자별로 렌더.

- [ ] **Step 1: 카드 컴포넌트 작성** (기존 인박스 카드 로직 이식)

`src/app/pharmacy/(app)/pharmacy-request-card.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Phone } from '@phosphor-icons/react'
import { YCCard } from '@/components/yc/yc-card'
import { bucketByDue } from '@/lib/request-schedule'
import { TYPE_LABEL, type InboxRow, type ReqStatus } from '@/lib/pharmacy-board'

const STATUS: Record<ReqStatus, { label: string; cls: string }> = {
  open:         { label: '신규',     cls: 'bg-yc-green100 text-yc-green700' },
  acknowledged: { label: '확인함',   cls: 'bg-yc-infoBg text-yc-infoText' },
  done:         { label: '완료',     cls: 'bg-yc-neutral100 text-yc-neutral600' },
  canceled:     { label: '환자취소', cls: 'bg-yc-neutral100 text-yc-neutral500' },
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

export function PharmacyRequestCard({ row, today, onChange }: { row: InboxRow; today: string; onChange: (r: InboxRow) => void }) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [replying, setReplying] = useState(false)

  function dueBadge(due: string | null): { text: string; danger: boolean } {
    const b = bucketByDue(due, today)
    if (b === 'overdue')  return { text: '지연',  danger: true }
    if (b === 'today')    return { text: '오늘',  danger: false }
    if (b === 'tomorrow') return { text: '내일',  danger: false }
    const diff = due ? Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000) : 0
    return { text: `D-${diff}`, danger: false }
  }
  function addDays(n: number): string {
    return new Date(Date.parse(today + 'T00:00:00Z') + n * 86_400_000).toISOString().split('T')[0]
  }

  async function sendReply() {
    const text = draft.trim(); if (!text) return
    setReplying(true)
    try {
      const res = await fetch('/api/pharmacy/request/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, text }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error)
      onChange({ ...row, replyText: text, repliedAt: new Date().toISOString(), status: 'acknowledged' })
      setDraft('')
      toast.success('환자에게 답을 보냈어요')
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : '전송 실패') }
    finally { setReplying(false) }
  }
  async function setStatus(status: 'acknowledged' | 'done') {
    setBusy(true)
    try {
      const res = await fetch('/api/pharmacy/request/status', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, status }),
      })
      if (!res.ok) throw new Error()
      onChange({ ...row, status })
      toast.success(status === 'done' ? '완료 처리했어요' : '확인 처리했어요')
    } catch { toast.error('처리 실패') } finally { setBusy(false) }
  }
  async function changeDue(due_date: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/pharmacy/request/due', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, due_date }),
      })
      if (!res.ok) throw new Error()
      onChange({ ...row, due_date })
      toast.success('마감을 바꿨어요')
    } catch { toast.error('변경 실패') } finally { setBusy(false) }
  }

  const badge = dueBadge(row.due_date)
  return (
    <YCCard radius="lg" className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-yc-neutral900">{TYPE_LABEL[row.type] ?? '요청'}</p>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-yc-sm ${badge.danger ? 'bg-yc-errorBg text-yc-error' : 'bg-yc-neutral100 text-yc-neutral600'}`}>{badge.text}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-yc-sm ${STATUS[row.status].cls}`}>{STATUS[row.status].label}</span>
        </div>
      </div>
      <p className="text-xs text-yc-neutral500">
        {row.isFamily && <span className="text-yc-neutral400">가족 요청 · </span>}{timeAgo(row.created_at)}
      </p>
      {row.note && <p className="text-sm text-yc-neutral700 break-keep">{row.note}</p>}
      {row.replyText ? (
        <div className="rounded-yc-md bg-yc-green50 px-3 py-2">
          <p className="text-sm text-yc-neutral800 break-keep">{row.replyText}</p>
          <p className="text-xs text-yc-neutral500 mt-1">{row.patientAckAt ? '환자 확인함' : '답 보냄'}{row.repliedAt ? ` · ${timeAgo(row.repliedAt)}` : ''}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <textarea
            value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendReply() }}
            maxLength={300} rows={2}
            placeholder="예약·재고·픽업 안내를 적어주세요 (예: 오후 3시 이후 픽업 가능)"
            aria-label="환자에게 보낼 안내"
            className="w-full px-3 py-2 border border-yc-neutral200 rounded-yc-md text-sm focus:outline-none focus:border-yc-green600 resize-none"
          />
          <p className="text-xs text-yc-neutral400 text-right">{draft.length}/300</p>
          <button onClick={sendReply} disabled={replying || !draft.trim()}
            className="min-h-[48px] px-4 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50">답 보내기</button>
          <p className="text-xs text-yc-neutral400">예약·물류 안내용 — 복약 상담은 전화·대면으로</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {row.contact_phone && (
          <a href={`tel:${row.contact_phone.replace(/[^0-9]/g, '')}`}
            className="inline-flex items-center gap-1.5 h-11 px-3 rounded-yc-md bg-yc-green100 text-yc-green700 text-sm font-semibold active:opacity-80">
            <Phone weight="fill" size={15} /> 전화
          </a>
        )}
        <button onClick={() => changeDue(addDays(0))} disabled={busy}
          className="h-11 px-3 rounded-yc-md bg-yc-neutral100 text-yc-neutral700 text-sm font-semibold active:bg-yc-neutral200 disabled:opacity-50">오늘</button>
        <button onClick={() => changeDue(addDays(1))} disabled={busy}
          className="h-11 px-3 rounded-yc-md bg-yc-neutral100 text-yc-neutral700 text-sm font-semibold active:bg-yc-neutral200 disabled:opacity-50">내일</button>
        {row.status === 'open' && (
          <button onClick={() => setStatus('acknowledged')} disabled={busy}
            className="h-11 px-3 rounded-yc-md bg-yc-neutral100 text-yc-neutral700 text-sm font-semibold active:bg-yc-neutral200 disabled:opacity-50">확인</button>
        )}
        <button onClick={() => setStatus('done')} disabled={busy}
          className="h-11 px-3 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50">완료</button>
      </div>
    </YCCard>
  )
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add src/app/pharmacy/\(app\)/pharmacy-request-card.tsx
git commit -m "feat(pharmacy): 요청 카드 공용 컴포넌트 추출(답장·전화·마감·완료)"
```

---

## Task 6: 깜박임 키프레임 추가

**Files:**
- Modify: `src/app/globals.css` (핸드오프 애니메이션 섹션 근처, 예: `ycSwipeHint` 정의 뒤)

**Interfaces:**
- Produces: 유틸 클래스 `.animate-yc-request-blink`. Task 7(목록)의 깜박이는 점에 사용.

- [ ] **Step 1: 키프레임 + 유틸 추가**

`src/app/globals.css`의 `@keyframes ycSwipeHint { ... }` 블록 **뒤**에 추가:

```css
/* 새 요청 온 환자 표시 — 점만 깜박(opacity). reduced-motion 전역 블록이 자동 무력화. */
@keyframes ycRequestBlink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.35; }
}
.animate-yc-request-blink {
  animation: ycRequestBlink 1.1s ease-in-out infinite;
}
```

- [ ] **Step 2: 빌드로 CSS 유효성 확인**

Run: `npm run build`
Expected: 성공(빌드 에러 0).

- [ ] **Step 3: 커밋**

```bash
git add src/app/globals.css
git commit -m "feat(pharmacy): 새 요청 깜박임 키프레임(ycRequestBlink)"
```

---

## Task 7: 환자 목록 아코디언 + 깜박임 + `?focus=` 자동 펼침

**Files:**
- Modify: `src/app/pharmacy/(app)/pharmacy-patient-list.tsx` (전면 교체)

**Interfaces:**
- Consumes: `InboxRow`(`@/lib/pharmacy-board`), `PharmacyRequestCard`(Task 5), `YCCard`, `useSearchParams`(next/navigation).
- Produces: `PatientRow = { id; name; medCount; requests: InboxRow[] }`. `<PharmacyPatientList patients today />`. Task 11(page)이 렌더.

- [ ] **Step 1: 컴포넌트 전면 교체**

`src/app/pharmacy/(app)/pharmacy-patient-list.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CaretDown, CaretRight } from '@phosphor-icons/react'
import { YCCard } from '@/components/yc/yc-card'
import { PharmacyRequestCard } from './pharmacy-request-card'
import type { InboxRow } from '@/lib/pharmacy-board'

export type PatientRow = { id: string; name: string; medCount: number; requests: InboxRow[] }

function isActive(r: InboxRow) { return r.status === 'open' || r.status === 'acknowledged' }

export default function PharmacyPatientList({ patients, today }: { patients: PatientRow[]; today: string }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState(patients)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const focus = useSearchParams().get('focus')
  const refs = useRef<Record<string, HTMLLIElement | null>>({})

  // ?focus=<patientId> → 해당 환자 자동 펼침 + 스크롤
  useEffect(() => {
    if (!focus) return
    setOpen(prev => new Set(prev).add(focus))
    refs.current[focus]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus])

  const filtered = q.trim()
    ? rows.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase()))
    : rows

  function toggle(id: string) {
    setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function updateRequest(patientId: string, updated: InboxRow) {
    setRows(rs => rs.map(p => p.id === patientId
      ? { ...p, requests: p.requests.map(r => r.id === updated.id ? updated : r) }
      : p))
  }

  return (
    <div className="space-y-3">
      <input
        value={q} onChange={e => setQ(e.target.value)} placeholder="환자 이름 검색"
        className="w-full border border-yc-neutral200 rounded-yc-md px-4 h-11 text-sm text-yc-neutral900 placeholder:text-yc-neutral400 focus:outline-none focus:border-yc-green600"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-yc-neutral500 py-6 text-center">검색 결과가 없어요</p>
      ) : (
        <YCCard radius="lg" className="overflow-hidden">
          <ul className="divide-y divide-yc-neutral100">
            {filtered.map(p => {
              const activeReqs = p.requests.filter(isActive)
              const hasNew = activeReqs.length > 0
              const isOpen = open.has(p.id)
              return (
                <li key={p.id} ref={el => { refs.current[p.id] = el }}>
                  <div className="flex items-center justify-between px-5 py-2.5 active:bg-yc-neutral50 transition-colors">
                    {/* 환자 상세로 이동(복약 read-only) */}
                    <Link href={`/pharmacy/patients/${p.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-8 h-8 rounded-yc-sm bg-yc-neutral100 flex items-center justify-center text-yc-neutral700 font-semibold flex-shrink-0">
                        {p.name.slice(0, 1)}
                      </span>
                      <span className="font-semibold text-yc-neutral900 truncate">{p.name}</span>
                    </Link>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm text-yc-neutral500">약 {p.medCount}종</span>
                      {p.requests.length > 0 && (
                        <button onClick={() => toggle(p.id)} aria-expanded={isOpen}
                          aria-label={`요청 ${activeReqs.length}건 ${isOpen ? '접기' : '펼치기'}`}
                          className="flex items-center gap-1 h-9 px-2 rounded-yc-md active:bg-yc-neutral100">
                          {hasNew && <span className="w-2 h-2 rounded-full bg-yc-error animate-yc-request-blink" />}
                          <span className="text-xs font-bold text-white bg-yc-green600 rounded-yc-sm px-2 py-0.5">요청 {activeReqs.length || p.requests.length}</span>
                          <CaretDown size={14} className={`text-yc-neutral400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                      {p.requests.length === 0 && <CaretRight size={16} className="text-yc-neutral400" />}
                    </div>
                  </div>
                  {isOpen && p.requests.length > 0 && (
                    <div className="px-4 pb-3 space-y-2 bg-yc-neutral50">
                      {p.requests.map(r => (
                        <PharmacyRequestCard key={r.id} row={r} today={today} onChange={u => updateRequest(p.id, u)} />
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </YCCard>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add src/app/pharmacy/\(app\)/pharmacy-patient-list.tsx
git commit -m "feat(pharmacy): 환자 목록 아코디언+깜박임+focus 자동펼침(요청 귀속)"
```

---

## Task 8: 캘린더 컴포넌트

**Files:**
- Create: `src/app/pharmacy/(app)/pharmacy-calendar.tsx`

**Interfaces:**
- Consumes: `CalendarItem`, `monthGridDays`(`@/lib/pharmacy-board`), `YCCard`.
- Produces: `<PharmacyCalendar items today />`. Task 11(page)이 렌더.

- [ ] **Step 1: 컴포넌트 작성**

`src/app/pharmacy/(app)/pharmacy-calendar.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { YCCard } from '@/components/yc/yc-card'
import { monthGridDays, type CalendarItem } from '@/lib/pharmacy-board'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export default function PharmacyCalendar({ items, today }: { items: CalendarItem[]; today: string }) {
  const cells = useMemo(() => monthGridDays(today), [today])
  const [sel, setSel] = useState<string | null>(today)

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarItem[]>()
    for (const it of items) { const a = m.get(it.date) ?? []; a.push(it); m.set(it.date, a) }
    return m
  }, [items])

  const [y, mo] = today.split('-').map(Number)
  const selItems = sel ? byDate.get(sel) ?? [] : []

  return (
    <YCCard radius="lg" className="p-4 space-y-3">
      <p className="text-sm font-bold text-yc-neutral900">{y}년 {mo}월</p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DOW.map(d => <div key={d} className="text-xs text-yc-neutral400 py-1">{d}</div>)}
        {cells.map((date, i) => {
          if (!date) return <div key={`b${i}`} />
          const dayItems = byDate.get(date) ?? []
          const hasReq = dayItems.some(x => x.kind === 'request')
          const hasRef = dayItems.some(x => x.kind === 'refill')
          const isToday = date === today
          const isSel = date === sel
          return (
            <button key={date} onClick={() => setSel(date)}
              className={`aspect-square rounded-yc-sm flex flex-col items-center justify-center text-sm
                ${isSel ? 'bg-yc-green600 text-white' : isToday ? 'bg-yc-green50 text-yc-green700 font-bold' : 'text-yc-neutral700 active:bg-yc-neutral100'}`}>
              <span>{Number(date.split('-')[2])}</span>
              <span className="flex gap-0.5 h-1.5 mt-0.5">
                {hasReq && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-yc-warning'}`} />}
                {hasRef && <span className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-yc-green600'}`} />}
              </span>
            </button>
          )
        })}
      </div>
      <div className="border-t border-yc-neutral100 pt-2 space-y-1">
        <p className="text-xs text-yc-neutral500">{sel ? `${Number(sel.split('-')[1])}월 ${Number(sel.split('-')[2])}일` : '날짜를 선택하세요'}</p>
        {selItems.length === 0 ? (
          <p className="text-sm text-yc-neutral400">일정 없음</p>
        ) : selItems.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-yc-neutral700">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${it.kind === 'request' ? 'bg-yc-warning' : 'bg-yc-green600'}`} />
            <span className="truncate">{it.label}</span>
          </div>
        ))}
      </div>
    </YCCard>
  )
}
```

> **주의:** `bg-yc-warning`가 토큰에 없으면 `bg-yc-error`(주황 대체) 또는 globals.css 토큰을 확인해 존재하는 경고색 토큰으로 교체한다. `grep 'yc-warning\|--yc-warning' src/app/globals.css`로 확인.

- [ ] **Step 2: 경고색 토큰 확인 후 타입체크/빌드**

Run: `grep -n "yc-warning\|--yc-warning" src/app/globals.css` — 없으면 위 두 곳의 `bg-yc-warning`을 존재하는 토큰으로 교체.
Run: `npx tsc --noEmit && npm run build`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add src/app/pharmacy/\(app\)/pharmacy-calendar.tsx
git commit -m "feat(pharmacy): 월 캘린더(요청 마감·리필 점 + 날짜탭 목록)"
```

---

## Task 9: 수동 메모 리스트 컴포넌트 (`pharmacy-todo-list.tsx`)

**Files:**
- Create: `src/app/pharmacy/(app)/pharmacy-todo-list.tsx`

**Interfaces:**
- Consumes: `/api/pharmacy/todo`(Task 4).
- Produces: `<PharmacyTodoList initial />` where `initial: TodoItem[]`, `TodoItem = { id; text; done; created_at }`. Task 10(보드)이 렌더.

- [ ] **Step 1: 컴포넌트 작성**

`src/app/pharmacy/(app)/pharmacy-todo-list.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, X } from '@phosphor-icons/react'

export type TodoItem = { id: string; text: string; done: boolean; created_at: string }

export default function PharmacyTodoList({ initial }: { initial: TodoItem[] }) {
  const [items, setItems] = useState<TodoItem[]>(initial)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    const text = draft.trim(); if (!text || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/pharmacy/todo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error)
      setItems(x => [d.todo as TodoItem, ...x])
      setDraft('')
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : '추가 실패') }
    finally { setBusy(false) }
  }
  async function toggle(it: TodoItem) {
    setItems(x => x.map(t => t.id === it.id ? { ...t, done: !t.done } : t))
    try {
      const res = await fetch('/api/pharmacy/todo', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id, done: !it.done }) })
      if (!res.ok) throw new Error()
    } catch { setItems(x => x.map(t => t.id === it.id ? { ...t, done: it.done } : t)); toast.error('변경 실패') }
  }
  async function remove(id: string) {
    const prev = items
    setItems(x => x.filter(t => t.id !== id))
    try {
      const res = await fetch('/api/pharmacy/todo', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) throw new Error()
    } catch { setItems(prev); toast.error('삭제 실패') }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          maxLength={200} placeholder="메모 추가 (예: ○○님 약 발주)"
          aria-label="할 일 메모 추가"
          className="flex-1 border border-yc-neutral200 rounded-yc-md px-3 h-10 text-sm focus:outline-none focus:border-yc-green600"
        />
        <button onClick={add} disabled={busy || !draft.trim()} aria-label="메모 추가"
          className="w-10 h-10 flex items-center justify-center rounded-yc-md bg-yc-green600 text-white active:bg-yc-green700 disabled:opacity-50">
          <Plus size={18} weight="bold" />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-yc-neutral400">직접 적는 메모가 없어요</p>
      ) : (
        <ul className="space-y-1">
          {items.map(it => (
            <li key={it.id} className="flex items-center gap-2">
              <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                <input type="checkbox" checked={it.done} onChange={() => toggle(it)} className="w-4 h-4 accent-yc-green600 flex-shrink-0" />
                <span className={`text-sm truncate ${it.done ? 'line-through text-yc-neutral400' : 'text-yc-neutral700'}`}>{it.text}</span>
              </label>
              <button onClick={() => remove(it.id)} aria-label="메모 삭제"
                className="w-8 h-8 flex items-center justify-center text-yc-neutral400 active:text-yc-neutral600">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입체크/린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add src/app/pharmacy/\(app\)/pharmacy-todo-list.tsx
git commit -m "feat(pharmacy): 수동 할 일 메모 리스트(낙관적 CRUD)"
```

---

## Task 10: 현황판 컨테이너 (`pharmacy-status-board.tsx`)

**Files:**
- Create: `src/app/pharmacy/(app)/pharmacy-status-board.tsx`

**Interfaces:**
- Consumes: `AutoTask`(`@/lib/pharmacy-board`), `PharmacyTodoList`+`TodoItem`(Task 9), `YCCard`, `Link`.
- Produces: `<PharmacyStatusBoard autoTasks todos refillSoon overdue recent />`
  - `refillSoon: { patientId; patientName; dDay; expiryLabel }[]`
  - `overdue: { id; patientId; patientName; label }[]`
  - `recent: { id; name; agoLabel: string }[]`
  Task 11(page)이 조립해 렌더.

- [ ] **Step 1: 컴포넌트 작성**

`src/app/pharmacy/(app)/pharmacy-status-board.tsx`:

```tsx
import Link from 'next/link'
import { YCCard } from '@/components/yc/yc-card'
import type { AutoTask } from '@/lib/pharmacy-board'
import PharmacyTodoList, { type TodoItem } from './pharmacy-todo-list'

export type RefillSoon = { patientId: string; patientName: string; dDay: number; expiryLabel: string }
export type OverdueReq = { id: string; patientId: string; patientName: string; label: string }
export type RecentConn = { id: string; name: string; agoLabel: string }

function Block({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <YCCard radius="lg" className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-yc-neutral900">{title}</h3>
        {typeof count === 'number' && count > 0 && (
          <span className="text-xs font-bold text-white bg-yc-green600 rounded-yc-sm px-2 py-0.5">{count}</span>
        )}
      </div>
      {children}
    </YCCard>
  )
}

// ?focus=로 목록의 해당 환자를 자동 펼침
const focus = (id: string) => `/pharmacy?focus=${id}`

export default function PharmacyStatusBoard({ autoTasks, todos, refillSoon, overdue, recent }: {
  autoTasks: AutoTask[]; todos: TodoItem[]; refillSoon: RefillSoon[]; overdue: OverdueReq[]; recent: RecentConn[]
}) {
  return (
    <div className="space-y-4">
      <Block title="오늘 할 일" count={autoTasks.length}>
        {autoTasks.length === 0 ? (
          <p className="text-sm text-yc-neutral400">자동으로 챙길 일이 없어요</p>
        ) : (
          <ul className="space-y-1">
            {autoTasks.map(t => (
              <li key={t.id}>
                <Link href={focus(t.patientId)} className="flex items-center gap-2 text-sm text-yc-neutral700 py-1 active:opacity-70">
                  <span className="w-1.5 h-1.5 rounded-full bg-yc-green600 flex-shrink-0" />
                  <span className="truncate">{t.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-yc-neutral100 pt-2">
          <PharmacyTodoList initial={todos} />
        </div>
      </Block>

      <Block title="리필 임박" count={refillSoon.length}>
        {refillSoon.length === 0 ? (
          <p className="text-sm text-yc-neutral400">임박한 리필이 없어요</p>
        ) : (
          <ul className="space-y-1">
            {refillSoon.map(r => (
              <li key={r.patientId}>
                <Link href={focus(r.patientId)} className="flex items-center justify-between gap-2 text-sm py-1 active:opacity-70">
                  <span className="text-yc-neutral700 truncate">{r.patientName}</span>
                  <span className="text-xs text-yc-neutral500 flex-shrink-0">{r.dDay === 0 ? '오늘' : `D-${r.dDay}`} · {r.expiryLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="처리 늦은 요청" count={overdue.length}>
        {overdue.length === 0 ? (
          <p className="text-sm text-yc-neutral400">지연된 요청이 없어요</p>
        ) : (
          <ul className="space-y-1">
            {overdue.map(o => (
              <li key={o.id}>
                <Link href={focus(o.patientId)} className="flex items-center gap-2 text-sm py-1 active:opacity-70">
                  <span className="w-1.5 h-1.5 rounded-full bg-yc-error flex-shrink-0" />
                  <span className="text-yc-neutral700 truncate">{o.patientName} · {o.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="최근 연결된 단골" count={recent.length}>
        {recent.length === 0 ? (
          <p className="text-sm text-yc-neutral400">최근 연결이 없어요</p>
        ) : (
          <ul className="space-y-1">
            {recent.map(r => (
              <li key={r.id}>
                <Link href={focus(r.id)} className="flex items-center justify-between gap-2 text-sm py-1 active:opacity-70">
                  <span className="text-yc-neutral700 truncate">{r.name}</span>
                  <span className="text-xs text-yc-neutral500 flex-shrink-0">{r.agoLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  )
}
```

- [ ] **Step 2: 타입체크/린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 0.

- [ ] **Step 3: 커밋**

```bash
git add src/app/pharmacy/\(app\)/pharmacy-status-board.tsx
git commit -m "feat(pharmacy): 현황판 4블록(오늘할일·리필임박·지연요청·최근연결)"
```

---

## Task 11: page.tsx 데이터 조립 + 레이아웃 재구성 + 인박스 제거

**Files:**
- Modify: `src/app/pharmacy/(app)/page.tsx` (전면 교체)
- Delete: `src/app/pharmacy/(app)/pharmacy-request-inbox.tsx`

**Interfaces:**
- Consumes: 모든 이전 태스크 산출물.
- Produces: 최종 대시보드 화면.

- [ ] **Step 1: page.tsx 전면 교체**

`src/app/pharmacy/(app)/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CaretRight } from '@phosphor-icons/react/dist/ssr'
import PharmacyPatientList, { type PatientRow } from './pharmacy-patient-list'
import { PharmacyEmptyIcon, PharmacyQrIcon } from './pharmacy-icons'
import PharmacistNotify from './pharmacist-notify'
import DashboardPoll from './dashboard-poll'
import PharmacyCalendar from './pharmacy-calendar'
import PharmacyStatusBoard, { type RefillSoon, type OverdueReq, type RecentConn } from './pharmacy-status-board'
import type { TodoItem } from './pharmacy-todo-list'
import { YCCard } from '@/components/yc/yc-card'
import { todayKST, bucketByDue } from '@/lib/request-schedule'
import { computeRefillSoon, type RefillMedRow } from '@/lib/refill'
import { TYPE_LABEL, buildCalendarItems, deriveTodayAutoTasks, type InboxRow } from '@/lib/pharmacy-board'

export default async function PharmacyHome() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/pharmacy/login')
  const today = todayKST()

  // 동의 단골 환자 + 요청 + 내 약국 + 수동 메모 — 상호 무관, 동시 실행
  const [{ data: patients }, { data: reqs }, { data: pharmacy }, { data: todoRows }] = await Promise.all([
    supabase.from('profiles')
      .select('id, full_name, consent_pharmacist_view_at')
      .eq('consent_pharmacist_view', true).neq('id', user.id)
      .order('full_name', { ascending: true }).limit(200),
    supabase.from('pharmacy_requests')
      .select('id, type, note, contact_phone, status, created_at, due_date, patient_id, member_id, reply_text, replied_at, patient_ack_at')
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('pharmacies').select('id').eq('owner_id', user.id).maybeSingle(),
    supabase.from('pharmacy_todos').select('id, text, done, created_at')
      .order('done', { ascending: true }).order('created_at', { ascending: false }).limit(50),
  ])

  const ids = (patients ?? []).map(p => p.id as string)

  // 환자별 본인(is_self) 멤버 (약사는 본인 약만 — 가족 누수 방지)
  const selfMemberByPatient = new Map<string, string>()
  if (ids.length > 0) {
    const { data: selfMembers } = await supabase.from('members').select('id, owner_id').in('owner_id', ids).eq('is_self', true)
    for (const m of selfMembers ?? []) selfMemberByPatient.set(m.owner_id as string, m.id as string)
  }

  // 환자별 복약(카운트 + 리필 계산 겸용) — 본인 멤버만
  const medsByUser = new Map<string, RefillMedRow[]>()
  const countByUser = new Map<string, number>()
  const selfMemberIds = [...selfMemberByPatient.values()]
  if (ids.length > 0 && selfMemberIds.length > 0) {
    const { data: meds } = await supabase.from('user_medications')
      .select('user_id, member_id, total_days, custom_name, drug:drugs(item_name), prescription:user_prescriptions(id, prescribed_at, duration_days, hospital_name)')
      .is('deleted_at', null).is('ended_at', null)
      .in('user_id', ids).in('member_id', selfMemberIds)
    for (const m of meds ?? []) {
      const uid = m.user_id as string
      countByUser.set(uid, (countByUser.get(uid) ?? 0) + 1)
      const arr = medsByUser.get(uid) ?? []; arr.push(m as unknown as RefillMedRow); medsByUser.set(uid, arr)
    }
  }

  // 요청 → 환자별 그룹 + 이름
  const reqPatientIds = [...new Set((reqs ?? []).map(r => r.patient_id as string))]
  const { data: reqPats } = reqPatientIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', reqPatientIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const nameById = new Map<string, string | null>([
    ...(patients ?? []).map(p => [p.id as string, p.full_name as string | null] as const),
    ...(reqPats ?? []).map(p => [p.id as string, p.full_name as string | null] as const),
  ])

  const requestsByPatient = new Map<string, InboxRow[]>()
  for (const r of reqs ?? []) {
    const row: InboxRow = {
      id: r.id, type: r.type, note: r.note, contact_phone: r.contact_phone,
      status: r.status as InboxRow['status'], created_at: r.created_at, due_date: r.due_date,
      patientName: nameById.get(r.patient_id as string) ?? null, isFamily: !!r.member_id,
      replyText: r.reply_text, repliedAt: r.replied_at, patientAckAt: r.patient_ack_at, patientId: r.patient_id as string,
    }
    const arr = requestsByPatient.get(r.patient_id as string) ?? []; arr.push(row); requestsByPatient.set(r.patient_id as string, arr)
  }

  const rows: PatientRow[] = (patients ?? []).map(p => ({
    id: p.id as string,
    name: (p.full_name as string | null) ?? '이름 미등록',
    medCount: countByUser.get(p.id as string) ?? 0,
    requests: requestsByPatient.get(p.id as string) ?? [],
  }))

  // ── 현황판/캘린더 데이터 조립 ──
  // 리필(환자별 가장 임박)
  const refillSoon: RefillSoon[] = []
  const refillCalendar: { date: string | null; label: string }[] = []
  const refillsToday: { patientId: string; patientName: string }[] = []
  for (const [uid, meds] of medsByUser) {
    const items = computeRefillSoon(meds)
    if (items.length === 0) continue
    const name = nameById.get(uid) ?? '환자'
    const soonest = items[0]
    refillSoon.push({ patientId: uid, patientName: name, dDay: soonest.dDay, expiryLabel: soonest.expiryLabel })
    if (soonest.dDay === 0) refillsToday.push({ patientId: uid, patientName: name })
    for (const it of items) refillCalendar.push({ date: it.expiryDate, label: `${name} 리필` })
  }
  refillSoon.sort((a, b) => a.dDay - b.dDay)

  // 오늘 할 일(자동)
  const autoTasks = deriveTodayAutoTasks({
    requests: (reqs ?? []).map(r => ({
      id: r.id, patientId: r.patient_id as string, patientName: nameById.get(r.patient_id as string) ?? '환자',
      status: r.status as InboxRow['status'], due_date: r.due_date, replyText: r.reply_text,
    })),
    refillsToday, today,
  })

  // 지연 요청(overdue, 활성)
  const overdue: OverdueReq[] = (reqs ?? [])
    .filter(r => (r.status === 'open' || r.status === 'acknowledged') && bucketByDue(r.due_date, today) === 'overdue')
    .map(r => ({ id: r.id, patientId: r.patient_id as string, patientName: nameById.get(r.patient_id as string) ?? '환자', label: TYPE_LABEL[r.type] ?? '요청' }))

  // 캘린더 항목(요청 마감 + 리필)
  const calendarItems = buildCalendarItems(
    (reqs ?? []).filter(r => r.status === 'open' || r.status === 'acknowledged')
      .map(r => ({ date: r.due_date, label: `${nameById.get(r.patient_id as string) ?? '환자'} ${TYPE_LABEL[r.type] ?? '요청'}` })),
    refillCalendar,
  )

  // 최근 연결된 단골(공개 동의 시각 desc, 상위 5)
  const recent: RecentConn[] = [...(patients ?? [])]
    .filter(p => p.consent_pharmacist_view_at)
    .sort((a, b) => String(b.consent_pharmacist_view_at).localeCompare(String(a.consent_pharmacist_view_at)))
    .slice(0, 5)
    .map(p => {
      const days = Math.floor((Date.now() - Date.parse(p.consent_pharmacist_view_at as string)) / 86_400_000)
      return { id: p.id as string, name: (p.full_name as string | null) ?? '이름 미등록', agoLabel: days <= 0 ? '오늘' : `${days}일 전` }
    })

  const todos = (todoRows ?? []) as TodoItem[]
  const activeReqCount = (reqs ?? []).filter(r => r.status === 'open' || r.status === 'acknowledged').length

  return (
    <div className="space-y-5">
      <DashboardPoll />

      <div>
        <h1 className="font-display text-2xl text-yc-neutral900">단골 환자 복약 현황</h1>
        <p className="text-sm text-yc-neutral500 mt-1">
          {activeReqCount > 0
            ? `처리할 요청 ${activeReqCount}건 · 단골 환자 ${rows.length}명`
            : `내 약 목록 공개에 동의한 단골 환자 ${rows.length}명 · 읽기 전용`}
        </p>
      </div>

      {/* 좌=캘린더+현황판 / 우=알림+환자목록+QR */}
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(340px,420px)_1fr] lg:gap-6 lg:space-y-0">
        <div className="space-y-5">
          <PharmacyCalendar items={calendarItems} today={today} />
          <PharmacyStatusBoard autoTasks={autoTasks} todos={todos} refillSoon={refillSoon} overdue={overdue} recent={recent} />
        </div>

        <div className="space-y-5">
          <PharmacistNotify />
          {rows.length === 0 ? (
            <YCCard radius="lg" className="py-12 text-center px-6">
              <div className="mb-3 flex justify-center"><PharmacyEmptyIcon /></div>
              <p className="text-base font-semibold text-yc-neutral700 mb-1">아직 공개한 단골 환자가 없어요</p>
              <p className="text-sm text-yc-neutral500">환자가 설정에서 &ldquo;단골 약사에게 공개&rdquo;를 켜면 여기에 표시돼요</p>
            </YCCard>
          ) : (
            <PharmacyPatientList patients={rows} today={today} />
          )}

          <Link href="/pharmacy/qr"
            className="flex items-center gap-3 bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] px-5 py-4 active:bg-yc-neutral50">
            <PharmacyQrIcon />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-yc-neutral900">우리 약국 QR 만들기 · 인쇄</p>
              <p className="text-xs text-yc-neutral500 mt-0.5">환자가 스캔하면 자동으로 단골 연결돼요</p>
            </div>
            <CaretRight size={16} className="text-yc-neutral400" />
          </Link>
        </div>
      </div>

      <p className="text-xs text-yc-neutral500 leading-relaxed border-t border-yc-neutral100 pt-4 mt-8">
        이 화면은 환자가 동의한 복약 정보를 <b>읽기 전용</b>으로 보여주는 참고 도구입니다.
        진단·처방 변경·복약 중단 등 의학적 판단을 대체하지 않습니다.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: `RefillMedRow` export 확인**

`src/lib/refill.ts`에서 `RefillMedRow` 타입이 export 안 돼 있으면 `type RefillMedRow`를 `export type RefillMedRow`로 바꾼다(page가 import). 확인:
Run: `grep -n "RefillMedRow" src/lib/refill.ts`
export가 아니면 수정.

- [ ] **Step 3: 인박스 컴포넌트 삭제**

```bash
git rm src/app/pharmacy/\(app\)/pharmacy-request-inbox.tsx
```

- [ ] **Step 4: 회귀 게이트 전체**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 에러 0, 빌드 성공. (인박스 삭제로 미참조 import가 없어야 함.)

- [ ] **Step 5: 순수 테스트 재실행(회귀)**

Run: `node --experimental-strip-types --test e2e/refill-qa.mjs e2e/pharmacy-board-qa.mjs e2e/request-schedule-qa.mjs`
Expected: 전부 PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/app/pharmacy/\(app\)/page.tsx src/lib/refill.ts
git commit -m "feat(pharmacy): 대시보드 재구성 — 좌 캘린더+현황판, 우 환자목록(요청 귀속), 인박스 제거"
```

---

## Task 12: 실기기·시뮬 검증 + 마무리

**Files:** 없음(검증만)

- [ ] **Step 1: RLS 보안 e2e 전체 재실행(회귀)**

Run:
```bash
node e2e/pharmacy-todo-qa.mjs
node e2e/pharmacist-adherence-qa.mjs
node e2e/pharmacy-due-qa.mjs
```
Expected: 전부 PASS(가족 격리·약사 RLS·todo owner 격리 회귀 없음).

- [ ] **Step 2: 프로덕션 빌드 구동 + 약사 세션 주입 시뮬**

`npm run build && npm run start` 후, 기존 e2e 세션주입 패턴(`e2e/setup.mjs`류)으로 약사 계정 로그인 → `/pharmacy` 진입. 확인:
- 좌측 캘린더에 오늘/요청 마감/리필 점 표시, 날짜 탭 시 목록.
- 현황판 4블록 렌더(오늘 할 일 자동+수동 입력 동작, 리필/지연/최근연결).
- 우측 환자 행에 요청 있으면 배지+빨간 점 깜박임, 아코디언 펼쳐 답장·완료.
- 현황판/캘린더 항목 클릭 → `?focus=`로 해당 환자 자동 펼침+스크롤.

- [ ] **Step 3: 최종 커밋(있으면) + 요약**

미세 수정이 있었으면 커밋. `docs/`의 스펙/플랜과 실제 구현 일치 확인.

---

## Self-Review 결과

**Spec coverage:** 레이아웃 뒤바꿈(T11) · 요청 환자 귀속 아코디언(T5·T7) · 깜박임(T6·T7) · 캘린더 요청마감+리필(T2·T3·T8·T11) · 현황판 4블록(T3·T9·T10·T11) · pharmacy_todos(T1·T4) · 규제·가족격리·RLS(전 태스크 Global Constraints) · 검증(T4 e2e·T12). 스펙 §10 범위밖 항목 미구현 확인.

**Placeholder scan:** 코드 스텝 전부 실제 코드. `bg-yc-warning` 토큰 존재 여부만 T8 Step 2에서 확인·대체하도록 명시(플레이스홀더 아님, 방어 지시).

**Type consistency:** `InboxRow`/`ReqStatus`/`TYPE_LABEL`은 `pharmacy-board.ts` 단일 정의를 카드·목록·페이지가 공유. `PatientRow`에 `requests: InboxRow[]` 추가가 T7·T11 일치. `RefillItem.expiryDate`(T2)를 T11이 소비. `AutoTask`/`CalendarItem`/`RefillSoon`/`OverdueReq`/`RecentConn`/`TodoItem` 시그니처가 정의처(T3·T9·T10)와 소비처(T11) 일치.
