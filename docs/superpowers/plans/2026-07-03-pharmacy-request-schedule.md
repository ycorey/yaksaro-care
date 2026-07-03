# 약사 요청 마감 아젠다 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 약사 요청함을 마감(due_date) 기준 "오늘 중심 아젠다"(지연/오늘/내일/이번 주/이후)로 개편하고, 약사가 요청별 마감을 조정할 수 있게 한다.

**Architecture:** `pharmacy_requests`에 `due_date`(043) 추가 + 역할 트리거로 약사만 수정. 순수 헬퍼 `bucketByDue`가 마감을 버킷 분류하고, 요청함 컴포넌트가 버킷 아젠다로 렌더. 환자 화면 무변경.

**Tech Stack:** Next.js route handler · Supabase(admin/user client) · Postgres 트리거. 테스트: `node --experimental-strip-types --test`(Node 24 내장, 무의존성) + 실서버 e2e(playwright/fetch, 임시데이터 자동정리).

## Global Constraints

- 마감 단위 = **날짜(date)**. 구체 시각은 기존 약사 답변 텍스트가 담당(변경 없음).
- 환자 화면·환자 요청 플로우 무변경. 마감 조정은 **약사 전용**.
- 버킷 규칙(KST 일수차): `<0` overdue · `0` today · `1` tomorrow · `2~6` thisWeek · `≥7` later · `due=null`→today.
- 새 **런타임** 의존성 0. 마이그레이션 043은 운영 DB 적용 필요(due_date + 트리거 갱신 + 백필).
- 보안: 약사만 due_date 수정(RLS 내 약국 + 038 역할 트리거 확장). 환자는 due_date 변경 불가(트리거 고정).

---

### Task 1: `bucketByDue` 순수 헬퍼 (TDD)

**Files:**
- Create: `src/lib/request-schedule.ts`
- Create: `e2e/request-schedule-qa.mjs`

**Interfaces:**
- Produces: `type DueBucket = 'overdue'|'today'|'tomorrow'|'thisWeek'|'later'`
- Produces: `todayKST(): string` (YYYY-MM-DD, KST)
- Produces: `bucketByDue(due: string | null, today: string): DueBucket`

- [ ] **Step 1: 실패 테스트 작성** — `e2e/request-schedule-qa.mjs`:

```js
// 요청 마감 버킷 분류 단위 테스트 — Node 내장 러너, 무의존성.
// 실행: node --experimental-strip-types --test e2e/request-schedule-qa.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bucketByDue } from '../src/lib/request-schedule.ts'

const TODAY = '2026-07-15'
test('어제 → overdue', () => assert.equal(bucketByDue('2026-07-14', TODAY), 'overdue'))
test('오늘 → today', () => assert.equal(bucketByDue('2026-07-15', TODAY), 'today'))
test('내일 → tomorrow', () => assert.equal(bucketByDue('2026-07-16', TODAY), 'tomorrow'))
test('모레 → thisWeek', () => assert.equal(bucketByDue('2026-07-17', TODAY), 'thisWeek'))
test('+6일 → thisWeek', () => assert.equal(bucketByDue('2026-07-21', TODAY), 'thisWeek'))
test('+7일 → later', () => assert.equal(bucketByDue('2026-07-22', TODAY), 'later'))
test('null → today(누락 방지)', () => assert.equal(bucketByDue(null, TODAY), 'today'))
test('월 경계 넘김 계산', () => assert.equal(bucketByDue('2026-08-02', '2026-07-30'), 'thisWeek'))
```

- [ ] **Step 2: 실행 → 실패** — `node --experimental-strip-types --test e2e/request-schedule-qa.mjs` → FAIL(모듈/함수 없음)

- [ ] **Step 3: 구현** — `src/lib/request-schedule.ts`:

```ts
export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'later'

// KST 오늘 날짜 (YYYY-MM-DD)
export function todayKST(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().split('T')[0]
}

// 마감일(YYYY-MM-DD)과 기준일(YYYY-MM-DD)의 일수 차로 버킷 분류.
// 둘 다 UTC 자정으로 파싱해 순수 일수차를 낸다(타임존 영향 제거).
export function bucketByDue(due: string | null, today: string): DueBucket {
  if (!due) return 'today'
  const diff = Math.round(
    (Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000,
  )
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 6) return 'thisWeek'
  return 'later'
}
```

- [ ] **Step 4: 실행 → 통과** — `node --experimental-strip-types --test e2e/request-schedule-qa.mjs` → `pass 8`
- [ ] **Step 5: tsc·lint** — `npx tsc --noEmit`(TSC_EXIT=0) · `npm run lint`(0)
- [ ] **Step 6: 커밋**

```bash
git add src/lib/request-schedule.ts e2e/request-schedule-qa.mjs
git commit -m "feat(pharmacy): bucketByDue 마감 버킷 헬퍼 + 단위테스트"
```

---

### Task 2: 마이그레이션 043 (due_date + 트리거 갱신 + 백필) + 타입

**Files:**
- Create: `supabase/migrations/043_pharmacy_request_due_date.sql`
- Modify: `src/types/database.ts` (pharmacy_requests Row/Insert/Update에 `due_date`)

- [ ] **Step 1: 마이그레이션 SQL 작성** — `supabase/migrations/043_pharmacy_request_due_date.sql`:

```sql
-- 043: 약사 요청 마감일(due_date) — 오늘 중심 아젠다. 유형기본=접수일(당일), 약사 조정.
alter table public.pharmacy_requests
  add column if not exists due_date date;

-- 기존 행 백필: 접수일(KST) 기준
update public.pharmacy_requests
  set due_date = (created_at at time zone 'Asia/Seoul')::date
  where due_date is null;

-- 038 역할분기 트리거 함수 교체: 환자는 due_date 변경 불가(고정), 약사만 수정 허용.
create or replace function public.pharmacy_requests_pin_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.id            := old.id;
  new.patient_id    := old.patient_id;
  new.pharmacy_id   := old.pharmacy_id;
  new.member_id     := old.member_id;
  new.type          := old.type;
  new.note          := old.note;
  new.contact_phone := old.contact_phone;
  new.created_at    := old.created_at;

  if auth.uid() = old.patient_id then
    new.reply_text   := old.reply_text;
    new.replied_at   := old.replied_at;
    new.responded_at := old.responded_at;
    new.due_date     := old.due_date;   -- 환자는 마감일 변경 불가
  else
    new.patient_ack_at := old.patient_ack_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_preq_pin_immutable on public.pharmacy_requests;
create trigger trg_preq_pin_immutable
  before update on public.pharmacy_requests
  for each row execute function public.pharmacy_requests_pin_immutable();
```

- [ ] **Step 2: 타입 갱신** — `src/types/database.ts`의 `pharmacy_requests` 블록 Row/Insert/Update에 각각 `due_date: string | null` / `due_date?: string | null` / `due_date?: string | null` 추가(기존 컬럼 알파벳 순서 유지 — `created_at` 다음, `id` 앞).

- [ ] **Step 3: tsc 확인** — `npx tsc --noEmit`(TSC_EXIT=0). 타입에 due_date가 있어야 이후 태스크 select/insert가 타입 통과.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/043_pharmacy_request_due_date.sql src/types/database.ts
git commit -m "feat(pharmacy): 043 due_date 컬럼 + 역할트리거 갱신(환자 마감 고정) + 타입"
```

> **운영 적용(승인 필요):** 코드 배포 전 `mcp__claude_ai_Supabase__apply_migration`(project_id=`tjtugyoexwsqaquheega`, name=`pharmacy_request_due_date`, SQL=위 파일 내용)으로 043을 운영 DB에 적용한다. Task 5 보안 시나리오는 적용 후 실행.

---

### Task 3: 요청 생성 기본 마감 + 약사 마감 변경 API

**Files:**
- Modify: `src/app/api/pharmacy/request/route.ts` (POST insert)
- Create: `src/app/api/pharmacy/request/due/route.ts`

**Interfaces:**
- Consumes: `todayKST` (Task 1) from `@/lib/request-schedule`

- [ ] **Step 1: 요청 생성 시 due_date 기본값** — `request/route.ts` 상단 import에 추가:

```ts
import { todayKST } from '@/lib/request-schedule'
```

그리고 POST의 insert 객체에 `due_date` 추가:

```ts
    .insert({
      patient_id:    user.id,
      pharmacy_id:   profile.regular_pharmacy_id,
      member_id:     memberId,
      type:          body.type,
      note:          (body.note ?? '').toString().trim().slice(0, 300) || null,
      contact_phone: (body.contact_phone ?? '').toString().trim().slice(0, 30) || null,
      due_date:      todayKST(),   // 기본 마감 = 접수일(당일), 약사가 조정
    })
```

- [ ] **Step 2: 약사 마감 변경 엔드포인트** — `src/app/api/pharmacy/request/due/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 약사 전용: 요청 마감일 변경. user(약사) 토큰 + RLS(내 약국 요청) + 038 트리거(약사 브랜치 허용).
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id, due_date } = await request.json().catch(() => ({})) as { id?: string; due_date?: string }
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  if (!due_date || !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    return NextResponse.json({ error: '날짜 형식(YYYY-MM-DD)이 필요해요' }, { status: 400 })
  }

  const { error } = await supabase
    .from('pharmacy_requests')
    .update({ due_date })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

> RLS가 약사를 자기 약국 요청으로만 제한하므로 `.eq('id', id)`만으로 충분(타 약국 요청은 0행 갱신). 트리거가 약사 브랜치에서 due_date 통과.

- [ ] **Step 3: tsc·lint·build** — `npx tsc --noEmit`(0) · `npm run lint`(0) · `npm run build`(성공)
- [ ] **Step 4: 커밋**

```bash
git add "src/app/api/pharmacy/request/route.ts" "src/app/api/pharmacy/request/due/route.ts"
git commit -m "feat(pharmacy): 요청 생성 기본 마감(당일) + 약사 마감 변경 API"
```

---

### Task 4: 요청함을 마감 버킷 아젠다로 개편

**Files:**
- Modify: `src/app/pharmacy/(app)/page.tsx` (reqs select + inboxRows + today prop)
- Modify: `src/app/pharmacy/(app)/pharmacy-request-inbox.tsx` (InboxRow에 due_date + 버킷 렌더 + 마감 배지·변경)

**Interfaces:**
- Consumes: `bucketByDue`, `todayKST`, `DueBucket` (Task 1)

- [ ] **Step 1: 서버 페이지 — reqs select에 due_date, inboxRows·today 전달**

`page.tsx` reqs 쿼리 select에 `due_date` 추가:

```ts
      .select('id, type, note, contact_phone, status, created_at, due_date, patient_id, member_id, reply_text, replied_at, patient_ack_at')
```

inboxRows 매핑에 `due_date` 추가:

```ts
  const inboxRows: InboxRow[] = (reqs ?? []).map(r => ({
    id: r.id, type: r.type, note: r.note, contact_phone: r.contact_phone,
    status: r.status as InboxRow['status'], created_at: r.created_at,
    due_date: r.due_date,
    patientName: nameById.get(r.patient_id as string) ?? null,
    isFamily: !!r.member_id,
    replyText: r.reply_text,
    repliedAt: r.replied_at,
    patientAckAt: r.patient_ack_at,
  }))
```

`page.tsx` 상단 import에 추가하고 today를 컴포넌트에 전달:

```ts
import { todayKST } from '@/lib/request-schedule'
```
```tsx
          <PharmacyRequestInbox initial={inboxRows} today={todayKST()} />
```

- [ ] **Step 2: 인박스 컴포넌트 — 타입·import·버킷 구성**

`pharmacy-request-inbox.tsx` 상단 import에 추가:

```ts
import { bucketByDue, type DueBucket } from '@/lib/request-schedule'
```

`InboxRow` 타입에 `due_date` 추가(`created_at` 다음 줄):

```ts
  status: ReqStatus; created_at: string; due_date: string | null; patientName: string | null; isFamily?: boolean
```

컴포넌트 시그니처에 `today` prop 추가:

```ts
export default function PharmacyRequestInbox({ initial, today }: { initial: InboxRow[]; today: string }) {
```

`active` 계산 아래에 버킷 그룹·라벨 상수 추가:

```ts
  const BUCKET_META: { key: DueBucket; label: string; danger?: boolean }[] = [
    { key: 'overdue',  label: '지연',     danger: true },
    { key: 'today',    label: '오늘' },
    { key: 'tomorrow', label: '내일' },
    { key: 'thisWeek', label: '이번 주' },
    { key: 'later',    label: '이후' },
  ]
  const byBucket = (b: DueBucket) =>
    active
      .filter(r => bucketByDue(r.due_date, today) === b)
      .sort((a, c) => (a.due_date ?? '').localeCompare(c.due_date ?? ''))
```

- [ ] **Step 3: 인박스 — 마감 변경 핸들러 추가**

`setStatus` 함수 아래에 추가:

```ts
  async function changeDue(id: string, due_date: string) {
    setBusy(id)
    try {
      const res = await fetch('/api/pharmacy/request/due', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, due_date }),
      })
      if (!res.ok) throw new Error()
      setRows(r => r.map(x => x.id === id ? { ...x, due_date } : x))
      toast.success('마감을 바꿨어요')
    } catch { toast.error('변경 실패') } finally { setBusy(null) }
  }

  // 마감 배지 텍스트 (오늘/내일/D-n/지연)
  function dueBadge(due: string | null): { text: string; danger: boolean } {
    const b = bucketByDue(due, today)
    if (b === 'overdue')  return { text: '지연',  danger: true }
    if (b === 'today')    return { text: '오늘',  danger: false }
    if (b === 'tomorrow') return { text: '내일',  danger: false }
    const diff = due ? Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000) : 0
    return { text: `D-${diff}`, danger: false }
  }

  // 마감 빠른 변경용 날짜 문자열 (오늘/내일)
  function addDays(n: number): string {
    return new Date(Date.parse(today + 'T00:00:00Z') + n * 86_400_000).toISOString().split('T')[0]
  }
```

- [ ] **Step 4: 인박스 — 렌더를 버킷 아젠다로 교체**

기존 `active.map(r => (…))` 블록(카드 리스트)을 버킷 섹션으로 감싼다. 각 버킷 헤더 아래 그 버킷의 카드를 렌더하고, 카드 상단 상태 배지 옆에 **마감 배지**를, 카드 액션줄에 **마감 변경(오늘·내일)** 버튼을 추가한다. 카드 내부(답변/전화/확인/완료)는 기존 그대로.

버킷 렌더(기존 `rows.length === 0 ? … : active.length === 0 ? … : active.map(...)` 중 `active.map` 부분을 아래로 교체):

```tsx
      ) : (
        BUCKET_META.map(bm => {
          const items = byBucket(bm.key)
          if (items.length === 0) return null
          return (
            <div key={bm.key} className="space-y-2">
              <p className={`text-xs font-bold ${bm.danger ? 'text-yc-error' : 'text-yc-neutral500'}`}>
                {bm.danger ? '⚠ ' : ''}{bm.label} <span className="text-yc-neutral400">{items.length}</span>
              </p>
              {items.map(r => {
                const badge = dueBadge(r.due_date)
                return (
                  <YCCard key={r.id} radius="lg" className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-yc-neutral900">{TYPE_LABEL[r.type] ?? '요청'}</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-yc-sm ${badge.danger ? 'bg-yc-errorBg text-yc-error' : 'bg-yc-neutral100 text-yc-neutral600'}`}>{badge.text}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-yc-sm ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                      </div>
                    </div>
                    <p className="text-xs text-yc-neutral500">
                      {r.patientName ?? '환자'}
                      {r.isFamily && <span className="ml-1 text-yc-neutral400">· 가족</span>}
                      {' · '}{timeAgo(r.created_at)}
                    </p>
                    {r.note && <p className="text-sm text-yc-neutral700 break-keep">{r.note}</p>}
                    {r.replyText ? (
                      <div className="rounded-yc-md bg-yc-green50 px-3 py-2">
                        <p className="text-sm text-yc-neutral800 break-keep">{r.replyText}</p>
                        <p className="text-xs text-yc-neutral500 mt-1">{r.patientAckAt ? '환자 확인함' : '답 보냄'}{r.repliedAt ? ` · ${timeAgo(r.repliedAt)}` : ''}</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <textarea
                          value={replyDraft[r.id] ?? ''}
                          onChange={e => setReplyDraft(s => ({ ...s, [r.id]: e.target.value }))}
                          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendReply(r.id) }}
                          maxLength={300} rows={2}
                          placeholder="예약·재고·픽업 안내를 적어주세요 (예: 오후 3시 이후 픽업 가능)"
                          aria-label="환자에게 보낼 안내"
                          className="w-full px-3 py-2 border border-yc-neutral200 rounded-yc-md text-sm focus:outline-none focus:border-yc-green600 resize-none"
                        />
                        <p className="text-xs text-yc-neutral400 text-right">{(replyDraft[r.id] ?? '').length}/300</p>
                        <button onClick={() => sendReply(r.id)} disabled={replying === r.id || !(replyDraft[r.id] ?? '').trim()}
                          className="min-h-[48px] px-4 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50">답 보내기</button>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {r.contact_phone && (
                        <a href={`tel:${r.contact_phone.replace(/[^0-9]/g, '')}`}
                          className="inline-flex items-center gap-1.5 h-11 px-3 rounded-yc-md bg-yc-green100 text-yc-green700 text-sm font-semibold active:opacity-80">
                          <Phone weight="fill" size={15} /> 전화
                        </a>
                      )}
                      <button onClick={() => changeDue(r.id, addDays(0))} disabled={busy === r.id}
                        className="h-11 px-3 rounded-yc-md bg-yc-neutral100 text-yc-neutral700 text-sm font-semibold active:bg-yc-neutral200 disabled:opacity-50">오늘</button>
                      <button onClick={() => changeDue(r.id, addDays(1))} disabled={busy === r.id}
                        className="h-11 px-3 rounded-yc-md bg-yc-neutral100 text-yc-neutral700 text-sm font-semibold active:bg-yc-neutral200 disabled:opacity-50">내일</button>
                      {r.status === 'open' && (
                        <button onClick={() => setStatus(r.id, 'acknowledged')} disabled={busy === r.id}
                          className="h-11 px-3 rounded-yc-md bg-yc-neutral100 text-yc-neutral700 text-sm font-semibold active:bg-yc-neutral200 disabled:opacity-50">확인</button>
                      )}
                      <button onClick={() => setStatus(r.id, 'done')} disabled={busy === r.id}
                        className="h-11 px-3 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50">완료</button>
                    </div>
                  </YCCard>
                )
              })}
            </div>
          )
        })
      )}
```

> 기존 "최근 처리 N건"(done/canceled 접이식) 블록은 그대로 둔다. `TYPE_LABEL`·`STATUS`·`timeAgo`·상태 핸들러·reply 상태는 기존 그대로 사용.

- [ ] **Step 5: tsc·lint·build** — `npx tsc --noEmit`(0) · `npm run lint`(0) · `npm run build`(성공)
- [ ] **Step 6: 회귀 — Task 1 테스트 재실행** — `node --experimental-strip-types --test e2e/request-schedule-qa.mjs` → `pass 8`
- [ ] **Step 7: 커밋**

```bash
git add "src/app/pharmacy/(app)/page.tsx" "src/app/pharmacy/(app)/pharmacy-request-inbox.tsx"
git commit -m "feat(pharmacy): 요청함을 마감 버킷 아젠다로 개편(마감 배지·오늘/내일 변경)"
```

---

### Task 5: 마감 보안 시나리오 검증 (043 운영 적용 후)

> **선행:** Task 2의 043이 운영 DB에 적용돼 있어야 함(승인). 미적용이면 이 태스크는 건너뛰고 적용 후 실행.

**Files:**
- Create: `e2e/pharmacy-due-qa.mjs`

- [ ] **Step 1: 시나리오 e2e 작성** — `e2e/pharmacy-due-qa.mjs`:
  - `_env.mjs`의 admin으로 임시 약사 유저(role=pharmacist) + 그 소유 임시 약국 + 임시 환자 유저 생성.
  - 임시 환자로 pharmacy_requests 1건 생성(due_date=오늘).
  - **약사 세션 쿠키**로 `PATCH /api/pharmacy/request/due`(due_date=내일) → 200, DB에 내일로 반영 확인.
  - **환자 세션 쿠키**로 `pharmacy_requests` due_date 직접 UPDATE 시도(supabase user client) → 트리거가 OLD로 고정돼 **변경 안 됨** 확인.
  - finally: 요청·약국·유저 전량 삭제.
  - 세션쿠키 캡처는 `qr-flow-sim.mjs`의 `@supabase/ssr signInWithPassword→setAll` 패턴 재사용.

- [ ] **Step 2: 서버 기동 후 실행**

```
npm run build && npx next start -p 3000  (백그라운드)
QR_SIM_BASE=http://localhost:3000 node e2e/pharmacy-due-qa.mjs
```
Expected: 모든 체크 PASS (약사 due 변경 성공 · 환자 변조 차단)

- [ ] **Step 3: 커밋**

```bash
git add e2e/pharmacy-due-qa.mjs
git commit -m "test(pharmacy): 마감 변경 권한 시나리오(약사 허용·환자 차단) e2e"
```

---

## Self-Review

**1. Spec coverage:**
- due_date 추가·백필·트리거 갱신 → Task 2. ✅
- 유형기본=당일 → Task 3 Step 1. ✅
- 약사 마감 조정 → Task 3 Step 2 + Task 4 카드 버튼. ✅
- 아젠다 버킷 뷰 → Task 1(bucketByDue) + Task 4. ✅
- 환자 무변경 → 어느 태스크도 환자 요청 UI 미변경(POST insert에 서버측 due_date만). ✅
- 보안(약사만 수정) → Task 2 트리거 + Task 5 검증. ✅
- 비목표(푸시·월캘린더·환자요약) → 계획에 없음. ✅

**2. Placeholder scan:** 모든 스텝 실제 코드·명령 포함. Task 5는 서술형 스텝이나 재사용 패턴(qr-flow-sim)을 명시 — 실행 시 해당 파일 참조.

**3. Type/이름 일관성:** `bucketByDue(due, today)`·`todayKST()`·`DueBucket`가 Task 1 정의와 Task 3/4 사용처 일치. `due_date: string | null`가 타입(Task 2)·InboxRow(Task 4)·API 전반 일치.
