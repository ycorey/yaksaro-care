# 단골약국 약사 회신 + 환자 1탭 응답 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 약사가 환자의 비임상 요청에 자유 텍스트로 회신하고, 환자는 "확인했어요" 1탭으로 응답하는 단방향 소통을 추가한다(전화 외 경로).

**Architecture:** 기존 `pharmacy_requests` 테이블에 회신 컬럼 3개를 추가하고, 037 무결성 트리거를 역할 분기(환자/약사)로 교체해 컬럼 단위 쓰기 권한을 강제한다. 약사 회신용 신규 라우트 + 환자 PATCH 확장, 양측 UI에 회신 표시를 붙인다. 약사 회신은 자유 텍스트지만 `safety-frame`의 금칙어 게이트로 임상 표현을 차단한다.

**Tech Stack:** Next.js 16.2.6(App Router) · Supabase(RLS+trigger) · TypeScript · Tailwind v4 · web-push

## Global Constraints

- **규제선**: 약사 회신은 비임상(예약·재고·픽업·방문 안내)만. 환자는 자유 입력 없음(1탭만) — 양방향 채팅화 금지.
- **회신 길이**: `reply_text` ≤ 300자, 빈 문자열 불가.
- **금칙어 게이트**: 약사 회신 텍스트는 `passesSafetyFrame()`(`src/lib/lifestyle-info/safety-frame.ts`) 통과분만 저장.
- **보안**: 모든 쓰기는 사용자(약사/환자) 토큰 + RLS. service_role 사용 금지(푸시용 owner 조회 제외). 푸시는 `await` 없이 fire-and-forget.
- **검증 방식(이 레포 표준)**: 단위테스트 프레임워크 없음. 각 코드 태스크는 `npx tsc --noEmit`(exit 0) + `npm run lint`(exit 0)로 검증. 통합 태스크는 실제 토큰 라운드트립 스크립트 + `npm run build`.
- **UI**: 실버 터치타깃 ≥48px, 색은 `yc-*` 토큰만(하드코딩 hex 금지), 양측 면책 문구 노출.
- **마이그레이션**: Supabase에 적용(이 레포는 DB-first — 031~037 적용 완료). 적용 후 `npx tsc` 전에 types 갱신.

---

### Task 1: 마이그레이션 038 — 회신 컬럼 + 트리거 역할 분기 + 타입 갱신

**Files:**
- Create: `supabase/migrations/038_pharmacy_request_reply.sql`
- Modify: `src/types/database.ts` (pharmacy_requests Row/Insert/Update에 컬럼 3개)

**Interfaces:**
- Produces: `pharmacy_requests` 컬럼 `reply_text text|null`, `replied_at timestamptz|null`, `patient_ack_at timestamptz|null`. 트리거 `trg_preq_pin_immutable`가 역할별 컬럼 쓰기 제한.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/038_pharmacy_request_reply.sql`:

```sql
-- 038: 약사 자유 텍스트 회신 + 환자 1탭 확인.
-- 037 트리거를 역할 분기로 교체해 새 회신 컬럼의 쓰기 권한을 컬럼 단위로 강제.

alter table public.pharmacy_requests
  add column if not exists reply_text     text,
  add column if not exists replied_at     timestamptz,
  add column if not exists patient_ack_at timestamptz;

-- 037의 pin 함수 교체(같은 트리거명 재정의). status/responded_at 외 컬럼을
-- 역할(환자/약사)에 따라 OLD로 고정해 변조 차단.
create or replace function public.pharmacy_requests_pin_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 공통: 식별·원본 컬럼은 어느 쪽도 변경 불가
  new.id            := old.id;
  new.patient_id    := old.patient_id;
  new.pharmacy_id   := old.pharmacy_id;
  new.member_id     := old.member_id;
  new.type          := old.type;
  new.note          := old.note;
  new.contact_phone := old.contact_phone;
  new.created_at    := old.created_at;

  if auth.uid() = old.patient_id then
    -- 환자: status(취소)·patient_ack_at만 허용 → 약사 회신 필드 고정
    new.reply_text   := old.reply_text;
    new.replied_at   := old.replied_at;
    new.responded_at := old.responded_at;
  else
    -- 약사(RLS가 자기 약국으로 이미 제한): reply_text·replied_at·status·responded_at 허용
    -- → 환자 전용 필드 고정
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

- [ ] **Step 2: 운영 DB에 적용**

Supabase MCP `apply_migration`(project_id=`tjtugyoexwsqaquheega`, name=`038_pharmacy_request_reply`)로 위 SQL 적용. (MCP 불가 환경이면 Supabase SQL Editor에 붙여 실행.)

- [ ] **Step 3: 적용 검증**

Supabase MCP `execute_sql`:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='pharmacy_requests'
  and column_name in ('reply_text','replied_at','patient_ack_at')
order by column_name;
```

Expected: 3행(`patient_ack_at`,`replied_at`,`reply_text`).

- [ ] **Step 4: 타입 갱신**

Supabase MCP `generate_typescript_types`(project_id 동일) 결과로 `src/types/database.ts`를 덮어쓰거나, 불가하면 `pharmacy_requests`의 `Row`에 `reply_text: string | null`, `replied_at: string | null`, `patient_ack_at: string | null` 추가하고 `Insert`/`Update`에 같은 키를 `?: string | null`로 추가.

- [ ] **Step 5: 타입 검증**

Run: `npx tsc --noEmit`
Expected: exit 0 (기존 코드가 새 컬럼을 안 써도 통과)

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/038_pharmacy_request_reply.sql src/types/database.ts
git commit -m "feat(pharmacy): 038 회신 컬럼 + 트리거 역할 분기 + 타입"
```

---

### Task 2: 약사 회신 API — `POST /api/pharmacy/request/reply`

**Files:**
- Create: `src/app/api/pharmacy/request/reply/route.ts`

**Interfaces:**
- Consumes: `passesSafetyFrame(text: string): boolean` from `@/lib/lifestyle-info/safety-frame`; `sendPushToUser(userId, {title, body, url})` from `@/lib/push`.
- Produces: `POST /api/pharmacy/request/reply` body `{ id: string, text: string }` → `{ ok: true }` 또는 `{ error }`. 부수효과: `reply_text·replied_at` 기록, open→acknowledged 승격, 환자 푸시.

- [ ] **Step 1: 라우트 작성**

`src/app/api/pharmacy/request/reply/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push'
import { passesSafetyFrame } from '@/lib/lifestyle-info/safety-frame'

// 약사 자유 텍스트 회신(비임상). 사용자(약사) 토큰 + RLS(자기 약국만). 037 트리거가 컬럼 무결성 보장.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id, text } = await request.json().catch(() => ({})) as { id?: string; text?: string }
  const msg = (text ?? '').toString().trim()
  if (!id || !msg) return NextResponse.json({ error: '내용을 입력해주세요' }, { status: 400 })
  if (msg.length > 300) return NextResponse.json({ error: '300자 이내로 적어주세요' }, { status: 400 })
  if (!passesSafetyFrame(msg)) {
    return NextResponse.json(
      { error: '복약·진단 안내는 전화·대면으로 해주세요. 예약·재고·픽업 안내만 보낼 수 있어요.' },
      { status: 400 },
    )
  }

  // 회신 기록 — RLS(preq_pharmacist_update)가 자기 약국 요청만 허용
  const { data, error } = await supabase
    .from('pharmacy_requests')
    .update({ reply_text: msg, replied_at: new Date().toISOString() })
    .eq('id', id)
    .select('patient_id')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? '대상 없음' }, { status: 500 })

  // open이면 acknowledged로 승격(별도 가드 업데이트 — done/canceled는 안 건드림)
  await supabase.from('pharmacy_requests').update({ status: 'acknowledged' }).eq('id', id).eq('status', 'open')

  // 환자에게 푸시 (fire-and-forget)
  void sendPushToUser(data.patient_id as string, {
    title: '단골약국에서 답이 왔어요',
    body: msg.length > 40 ? msg.slice(0, 40) + '…' : msg,
    url: '/settings',
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 검증**

Run: `npx tsc --noEmit && npm run lint`
Expected: 둘 다 exit 0

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/pharmacy/request/reply/route.ts
git commit -m "feat(pharmacy): 약사 자유 텍스트 회신 API (금칙어 게이트)"
```

---

### Task 3: 환자 PATCH 확장 — ack/cancel 액션

**Files:**
- Modify: `src/app/api/pharmacy/request/route.ts` (PATCH 함수)

**Interfaces:**
- Produces: `PATCH /api/pharmacy/request` body `{ id, action?: 'ack' | 'cancel' }`. `ack`→`patient_ack_at` 기록(회신 받은 본인 요청). `cancel`(또는 action 없음, 하위호환)→status='canceled'(open/acknowledged 본인 요청).

- [ ] **Step 1: PATCH 본문 교체**

`src/app/api/pharmacy/request/route.ts`의 기존 `PATCH` 함수 전체를 아래로 교체:

```ts
// 환자 응답 — ack('확인했어요' 1탭) 또는 cancel(취소). 자유 입력 없음(채팅화 방지).
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id, action } = await request.json().catch(() => ({})) as { id?: string; action?: 'ack' | 'cancel' }
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  if (action === 'ack') {
    // 약사 회신(replied_at 존재)을 환자가 확인 — patient_ack_at만 기록
    const { error } = await supabase
      .from('pharmacy_requests')
      .update({ patient_ack_at: new Date().toISOString() })
      .eq('id', id).eq('patient_id', user.id).not('replied_at', 'is', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // 취소(기본·하위호환) — open/acknowledged 본인 요청
  const { error } = await supabase
    .from('pharmacy_requests')
    .update({ status: 'canceled' })
    .eq('id', id).eq('patient_id', user.id).in('status', ['open', 'acknowledged'])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 검증**

Run: `npx tsc --noEmit && npm run lint`
Expected: 둘 다 exit 0

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/pharmacy/request/route.ts
git commit -m "feat(pharmacy): 환자 PATCH에 ack/cancel 액션"
```

---

### Task 4: 약사 요청함 UI — 회신 입력 + 환자 확인 배지

**Files:**
- Modify: `src/app/pharmacy/(app)/page.tsx` (inbox 쿼리 + InboxRow 매핑)
- Modify: `src/app/pharmacy/(app)/pharmacy-request-inbox.tsx` (InboxRow 타입 + 회신 UI)

**Interfaces:**
- Consumes: Task 2의 `POST /api/pharmacy/request/reply`.
- Produces: 약사가 활성 요청에 회신 텍스트 전송. `InboxRow`에 `reply_text`/`replied_at`/`patient_ack_at` 추가.

- [ ] **Step 1: page.tsx 쿼리·매핑에 컬럼 추가**

`src/app/pharmacy/(app)/page.tsx`에서 reqs select와 inboxRows 매핑 수정:

select 라인 교체:
```ts
    .select('id, type, note, contact_phone, status, created_at, patient_id, member_id, reply_text, replied_at, patient_ack_at')
```

inboxRows 매핑에 필드 추가(기존 객체에 이어):
```ts
  const inboxRows: InboxRow[] = (reqs ?? []).map(r => ({
    id: r.id, type: r.type, note: r.note, contact_phone: r.contact_phone,
    status: r.status as InboxRow['status'], created_at: r.created_at,
    patientName: nameById.get(r.patient_id as string) ?? null,
    isFamily: !!r.member_id,
    replyText: r.reply_text,
    repliedAt: r.replied_at,
    patientAckAt: r.patient_ack_at,
  }))
```

- [ ] **Step 2: InboxRow 타입 확장**

`src/app/pharmacy/(app)/pharmacy-request-inbox.tsx`의 `InboxRow` 타입에 필드 추가:

```ts
export type InboxRow = {
  id: string; type: string; note: string | null; contact_phone: string | null
  status: ReqStatus; created_at: string; patientName: string | null; isFamily?: boolean
  replyText?: string | null; repliedAt?: string | null; patientAckAt?: string | null
}
```

- [ ] **Step 3: 회신 입력·표시 UI 추가**

`pharmacy-request-inbox.tsx` 컴포넌트에 회신 상태/핸들러 추가. `useState` 임포트는 이미 있음. 컴포넌트 함수 상단(기존 `const [busy, ...]` 다음)에 추가:

```ts
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const [replying, setReplying] = useState<string | null>(null)

  async function sendReply(id: string) {
    const text = (replyDraft[id] ?? '').trim()
    if (!text) return
    setReplying(id)
    try {
      const res = await fetch('/api/pharmacy/request/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, text }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error)
      setRows(r => r.map(x => x.id === id ? { ...x, replyText: text, repliedAt: new Date().toISOString(), status: 'acknowledged' } : x))
      setReplyDraft(s => ({ ...s, [id]: '' }))
      toast.success('환자에게 답을 보냈어요')
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : '전송 실패') }
    finally { setReplying(null) }
  }
```

활성 요청 카드 내부에서, 기존 note 표시(`{r.note && ...}`) 다음에 회신 영역을 추가:

```tsx
          {/* 약사 회신(자유 텍스트) — 없으면 입력, 있으면 표시 */}
          {r.replyText ? (
            <div className="rounded-yc-md bg-yc-green50 px-3 py-2">
              <p className="text-sm text-yc-neutral800 break-keep">{r.replyText}</p>
              <p className="text-xs text-yc-neutral500 mt-1">
                {r.patientAckAt ? '환자 확인함' : '답 보냄'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <textarea
                value={replyDraft[r.id] ?? ''}
                onChange={e => setReplyDraft(s => ({ ...s, [r.id]: e.target.value }))}
                maxLength={300} rows={2}
                placeholder="예약·재고·픽업 안내를 적어주세요 (예: 오후 3시 이후 픽업 가능)"
                className="w-full px-3 py-2 border border-yc-neutral200 rounded-yc-md text-sm focus:outline-none focus:border-yc-green600 resize-none"
              />
              <button onClick={() => sendReply(r.id)} disabled={replying === r.id || !(replyDraft[r.id] ?? '').trim()}
                className="min-h-[48px] px-4 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50">
                답 보내기
              </button>
              <p className="text-xs text-yc-neutral400">예약·물류 안내용 — 복약 상담은 전화·대면으로</p>
            </div>
          )}
```

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit && npm run lint`
Expected: 둘 다 exit 0

- [ ] **Step 5: 커밋**

```bash
git add "src/app/pharmacy/(app)/page.tsx" "src/app/pharmacy/(app)/pharmacy-request-inbox.tsx"
git commit -m "feat(pharmacy): 요청함 약사 회신 입력 + 환자 확인 배지"
```

---

### Task 5: 환자 보낸요청 UI — 약사 답 표시 + "확인했어요" 1탭

**Files:**
- Modify: `src/app/settings/page.tsx` (요청 쿼리에 컬럼 추가)
- Modify: `src/app/settings/pharmacy-request.tsx` (Row 타입 + 답 표시 + ack 버튼)

**Interfaces:**
- Consumes: Task 3의 `PATCH /api/pharmacy/request` `{ id, action:'ack' }`.
- Produces: 환자가 약사 답을 보고 "확인했어요" 1탭.

- [ ] **Step 1: settings/page.tsx 쿼리에 컬럼 추가**

`src/app/settings/page.tsx`의 `pharmacy_requests` select 라인 교체:

```ts
        .select('id, type, note, status, created_at, reply_text, replied_at, patient_ack_at')
```

- [ ] **Step 2: PharmacyRequestRow 타입 확장**

`src/app/settings/pharmacy-request.tsx`의 `PharmacyRequestRow` 타입:

```ts
export type PharmacyRequestRow = {
  id: string; type: ReqType; note: string | null
  status: 'open' | 'acknowledged' | 'done' | 'canceled'; created_at: string
  reply_text?: string | null; replied_at?: string | null; patient_ack_at?: string | null
}
```

- [ ] **Step 3: ack 핸들러 추가**

`pharmacy-request.tsx`의 `cancel` 함수 다음에 추가:

```ts
  async function ack(id: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/pharmacy/request', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'ack' }),
      })
      if (!res.ok) throw new Error()
      setRequests(r => r.map(x => x.id === id ? { ...x, patient_ack_at: new Date().toISOString() } : x))
      toast.success('확인했어요')
    } catch { toast.error('실패했어요') } finally { setBusy(false) }
  }
```

- [ ] **Step 4: 보낸 요청 항목에 약사 답 + 1탭 버튼 표시**

`pharmacy-request.tsx`의 보낸 요청 map 내부(`{requests.slice(0, 6).map(r => (` 블록)를 아래로 교체:

```tsx
          {requests.slice(0, 6).map(r => (
            <div key={r.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-yc-neutral800 truncate">{LABEL[r.type]}{r.note ? ` · ${r.note}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                  {(r.status === 'open' || r.status === 'acknowledged') && (
                    <button onClick={() => cancel(r.id)} disabled={busy}
                      className="text-xs text-yc-neutral500 active:text-yc-error disabled:opacity-50">취소</button>
                  )}
                </div>
              </div>
              {/* 약사 답(자유 텍스트) + 확인 1탭 */}
              {r.reply_text && (
                <div className="rounded-yc-md bg-yc-green50 px-3 py-2 space-y-1.5">
                  <p className="text-sm text-yc-neutral800 break-keep">💬 {r.reply_text}</p>
                  {r.patient_ack_at ? (
                    <p className="text-xs text-yc-green700 font-semibold">확인함</p>
                  ) : (
                    <button onClick={() => ack(r.id)} disabled={busy}
                      className="min-h-[44px] px-4 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50">
                      확인했어요
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
```

- [ ] **Step 5: 검증**

Run: `npx tsc --noEmit && npm run lint`
Expected: 둘 다 exit 0

- [ ] **Step 6: 커밋**

```bash
git add src/app/settings/page.tsx src/app/settings/pharmacy-request.tsx
git commit -m "feat(pharmacy): 환자측 약사 답 표시 + 확인 1탭"
```

---

### Task 6: 통합 검증 — 실토큰 라운드트립 + 트리거 무결성 + 빌드

**Files:**
- Create(임시, 커밋 안 함): 스크래치패드 검증 스크립트

**Interfaces:**
- Consumes: Task 1~5 전부.

- [ ] **Step 1: 실토큰 라운드트립 + 트리거 검증 스크립트 작성**

스크래치패드에 `verify-reply.mjs` 작성(실제 약사·환자 로그인 토큰으로 RLS·트리거 검증, service_role 아님). 개화약국 약사 `ycorey@naver.com`/`kims3610`, 환자 gmail `894111c9-bd92-4c36-b897-194d35b5d955`, 약국 `56b182b8-003f-438b-b5ff-332342021fba`:

```js
import { readFileSync } from 'fs'; import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
const ROOT='C:/Users/main/yaksaro-care'; const env={}
readFileSync(resolve(ROOT,'.env.local'),'utf-8').split('\n').forEach(l=>{const[k,...v]=l.split('=');if(k&&!k.startsWith('#'))env[k.trim()]=v.join('=').trim()})
const URL=env['NEXT_PUBLIC_SUPABASE_URL'], ANON=env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
const admin=createClient(URL, env['SUPABASE_SERVICE_ROLE_KEY']||env['SUPABASE_SERVICE_ROLE'], {auth:{persistSession:false}})
// 1) 약사 로그인
const ph=createClient(URL,ANON,{auth:{persistSession:false}})
const {data:a}=await ph.auth.signInWithPassword({email:'ycorey@naver.com',password:'kims3610'})
const phc=createClient(URL,ANON,{global:{headers:{Authorization:`Bearer ${a.session.access_token}`}},auth:{persistSession:false}})
// 테스트 요청 1건 생성(admin로 시드 — 환자 gmail이 개화약국에 보낸 것처럼)
const PID='894111c9-bd92-4c36-b897-194d35b5d955', PHID='56b182b8-003f-438b-b5ff-332342021fba'
const {data:seed}=await admin.from('pharmacy_requests').insert({patient_id:PID,pharmacy_id:PHID,type:'pickup',status:'open'}).select('id').single()
const RID=seed.id
// 2) 약사 회신(정상)
let r=await phc.from('pharmacy_requests').update({reply_text:'오후 3시 이후 픽업 가능합니다',replied_at:new Date().toISOString()}).eq('id',RID).select('reply_text').single()
console.log('약사 회신:', r.data?.reply_text==='오후 3시 이후 픽업 가능합니다' ? 'PASS':'FAIL', r.error?.message||'')
// 3) 약사가 note(불변) 변조 시도 → 트리거가 OLD 고정
await phc.from('pharmacy_requests').update({note:'해킹'}).eq('id',RID)
let chk=await admin.from('pharmacy_requests').select('note').eq('id',RID).single()
console.log('약사 note 변조 차단:', chk.data?.note===null ? 'PASS':'⛔ LEAK', '(note=',chk.data?.note,')')
// 4) 환자 로그인 불가(소셜)이라 환자 경로는 admin+RLS 대신 트리거 단위로: 환자 토큰 없음 → 생략 표기
console.log('환자 ack 경로는 소셜 로그인이라 토큰 발급 불가 — UI 수동 확인 필요')
// 정리
await admin.from('pharmacy_requests').delete().eq('id',RID)
console.log('정리 완료')
```

- [ ] **Step 2: 스크립트 실행**

Run: `cd C:/Users/main/yaksaro-care && node <스크래치패드>/verify-reply.mjs`
Expected: `약사 회신: PASS`, `약사 note 변조 차단: PASS`, 정리 완료. (LEAK 나오면 트리거 점검)

- [ ] **Step 3: 금칙어 게이트 단위 확인**

Run: `cd C:/Users/main/yaksaro-care && node -e "import('./src/lib/lifestyle-info/safety-frame.ts')"` 가 불가하므로, 대신 라우트 로직과 동일하게 패턴만 확인 — 임시 노드에서 정규식 직접 평가 또는 dev 서버에서 `/api/pharmacy/request/reply`에 `{text:'약을 중단하세요'}` POST → 400 확인. (금칙어 `복용을 중단`/`약을 줄이`… 매칭)
Expected: 임상 표현 → 400, 일반 안내("3시 이후 픽업") → 통과

- [ ] **Step 4: 빌드**

Run: `cd C:/Users/main/yaksaro-care && npm run build`
Expected: exit 0

- [ ] **Step 5: 임시 스크립트 삭제(커밋 안 함) + 최종 확인**

스크래치패드 스크립트는 커밋하지 않음. `git status`로 의도한 변경만 스테이징됐는지 확인.

---

## Self-Review (작성자 체크)

- **Spec coverage**: 데이터모델(T1)·트리거 역할분기(T1)·약사 회신 API+금칙어(T2)·환자 ack/cancel(T3)·약사 UI(T4)·환자 UI(T5)·검증(T6) — 스펙 전 섹션 매핑됨.
- **Placeholder scan**: 모든 코드 스텝에 실제 코드 포함. "TBD/적절히 처리" 없음.
- **Type consistency**: `reply_text`(DB/스펙)와 UI prop `replyText`(카멜) 구분 명시(page.tsx 매핑에서 변환). 환자측은 DB명 그대로 `reply_text`(설정 쿼리가 직접 prop). `InboxRow.patientAckAt` ↔ `r.patient_ack_at` 매핑 일치.
- **주의**: 환자(소셜 로그인)는 access_token 발급이 어려워 ack 경로는 UI 수동 확인으로 둠(T6 Step1 주석). 트리거 환자분기 자체는 약사 분기 통과로 간접 신뢰 + 코드 리뷰로 보강.
