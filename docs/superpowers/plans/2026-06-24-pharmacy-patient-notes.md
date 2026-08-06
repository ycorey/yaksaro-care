# 약국 환자 특이사항 메모 (약사 비공개) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 약사가 환자 상세 화면에서 그 환자에 대한 약국 비공개 단일 메모(특이사항)를 작성·수정한다.

**Architecture:** 신규 `pharmacy_patient_notes`((pharmacy_id, patient_id) PK) 테이블 + RLS(약국 소유 AND `pharmacist_can_view` 동의 게이트, 환자 정책 없음). 약사 토큰 PUT upsert API + 환자 상세에 메모 카드(클라이언트) 추가. 환자에겐 비노출.

**Tech Stack:** Next.js 16.2.6(App Router) · Supabase(RLS) · TypeScript · Tailwind v4 · sonner

## Global Constraints

- 약사 비공개 — 환자에게 절대 노출 안 됨(환자 RLS 정책 없음).
- (pharmacy, patient) 쌍당 메모 1개(PK). 자유 텍스트 ≤500자. 빈 값 저장 = 행 삭제.
- 쓰기는 약사 사용자 토큰 + RLS. service_role 금지. pharmacy_id는 서버에서 owner 기준 조회.
- 접근 게이트: `pharmacy_id ∈ 내 약국` AND `pharmacist_can_view(patient_id)`(QR 단골 + 동의). 동의 철회 시 비노출.
- 검증(레포 표준): 단위테스트 없음 → 각 코드 태스크 `npx tsc --noEmit` exit 0 + `npm run lint` exit 0. 통합 태스크는 실토큰 + `npm run build`.
- 마이그레이션은 Supabase에 적용(DB-first). UI는 yc-* 토큰만.

---

### Task 1: 마이그레이션 039 + 타입

**Files:**
- Create: `supabase/migrations/039_pharmacy_patient_notes.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: 테이블 `pharmacy_patient_notes(pharmacy_id uuid, patient_id uuid, note text|null, updated_at timestamptz, pk(pharmacy_id,patient_id))` + 약사 RLS 3정책.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/039_pharmacy_patient_notes.sql`:

```sql
-- 039: 약국 환자 특이사항 메모(약사 비공개). 쌍당 단일 메모. 환자 미노출.
create table if not exists public.pharmacy_patient_notes (
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  patient_id  uuid not null references auth.users(id)        on delete cascade,
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (pharmacy_id, patient_id)
);

alter table public.pharmacy_patient_notes enable row level security;

-- 약사: 자기 약국 + 동의·연결 환자에 한해 조회/작성/수정 (환자 정책 없음 → 환자 접근 0)
drop policy if exists "ppn_pharmacist_select" on public.pharmacy_patient_notes;
create policy "ppn_pharmacist_select" on public.pharmacy_patient_notes
  for select using (
    pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid())
    and public.pharmacist_can_view(patient_id)
  );

drop policy if exists "ppn_pharmacist_insert" on public.pharmacy_patient_notes;
create policy "ppn_pharmacist_insert" on public.pharmacy_patient_notes
  for insert with check (
    pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid())
    and public.pharmacist_can_view(patient_id)
  );

drop policy if exists "ppn_pharmacist_update" on public.pharmacy_patient_notes;
create policy "ppn_pharmacist_update" on public.pharmacy_patient_notes
  for update using (
    pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid())
    and public.pharmacist_can_view(patient_id)
  ) with check (
    pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid())
    and public.pharmacist_can_view(patient_id)
  );

drop policy if exists "ppn_pharmacist_delete" on public.pharmacy_patient_notes;
create policy "ppn_pharmacist_delete" on public.pharmacy_patient_notes
  for delete using (
    pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid())
    and public.pharmacist_can_view(patient_id)
  );

create index if not exists idx_ppn_pharmacy on public.pharmacy_patient_notes(pharmacy_id);
```

(주의: 빈 메모 = DELETE이므로 delete 정책 필요 — 위에 포함.)

- [ ] **Step 2: 타입 수동 추가**

`src/types/database.ts`의 `public.Tables`에 `pharmacy_patient_notes` 항목 추가(다른 테이블 정의 형식과 동일하게):
```ts
pharmacy_patient_notes: {
  Row: { pharmacy_id: string; patient_id: string; note: string | null; updated_at: string }
  Insert: { pharmacy_id: string; patient_id: string; note?: string | null; updated_at?: string }
  Update: { pharmacy_id?: string; patient_id?: string; note?: string | null; updated_at?: string }
  Relationships: []
}
```

- [ ] **Step 3: 검증**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/039_pharmacy_patient_notes.sql src/types/database.ts
git commit -m "feat(pharmacy): 039 환자 특이사항 메모 테이블 + RLS + 타입"
```

(운영 DB 적용은 컨트롤러가 별도 수행 — 이 태스크에서 Supabase MCP 호출 금지.)

---

### Task 2: PUT API — 메모 upsert/삭제

**Files:**
- Create: `src/app/api/pharmacy/patient-note/route.ts`

**Interfaces:**
- Produces: `PUT /api/pharmacy/patient-note` body `{ patientId: string, note: string }` → `{ ok: true }` 또는 `{ error }`. 빈 note → 행 삭제. 약국 계정 아님 → 403.

- [ ] **Step 1: 라우트 작성**

`src/app/api/pharmacy/patient-note/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 약국 비공개 환자 메모 upsert/삭제. 약사 토큰 + RLS(자기 약국 + 동의 환자). pharmacy_id는 서버에서 강제.
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { patientId, note } = await request.json().catch(() => ({})) as { patientId?: string; note?: string }
  if (!patientId) return NextResponse.json({ error: 'patientId 필요' }, { status: 400 })
  const text = (note ?? '').toString().trim().slice(0, 500)

  const { data: pharmacy } = await supabase
    .from('pharmacies').select('id').eq('owner_id', user.id).maybeSingle()
  if (!pharmacy) return NextResponse.json({ error: '약국 계정이 아닙니다' }, { status: 403 })

  // 빈 메모 → 삭제(메모 비우기)
  if (!text) {
    const { error } = await supabase
      .from('pharmacy_patient_notes')
      .delete()
      .eq('pharmacy_id', pharmacy.id)
      .eq('patient_id', patientId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase
    .from('pharmacy_patient_notes')
    .upsert(
      { pharmacy_id: pharmacy.id, patient_id: patientId, note: text, updated_at: new Date().toISOString() },
      { onConflict: 'pharmacy_id,patient_id' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 검증**

Run: `npx tsc --noEmit && npm run lint`
Expected: 둘 다 exit 0

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/pharmacy/patient-note/route.ts
git commit -m "feat(pharmacy): 환자 특이사항 메모 PUT(upsert/삭제) API"
```

---

### Task 3: UI — 메모 카드 + 환자 상세 연결

**Files:**
- Create: `src/app/pharmacy/(app)/patient-note-card.tsx`
- Modify: `src/app/pharmacy/(app)/patients/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 2의 `PUT /api/pharmacy/patient-note`.
- Produces: 환자 상세에 메모 카드 노출(동의 환자 화면 한정).

- [ ] **Step 1: 메모 카드 클라이언트 컴포넌트 작성**

`src/app/pharmacy/(app)/patient-note-card.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

export default function PatientNoteCard({
  patientId, initialNote, initialUpdatedAt,
}: { patientId: string; initialNote: string; initialUpdatedAt: string | null }) {
  const [note, setNote] = useState(initialNote)
  const [savedAt, setSavedAt] = useState<string | null>(initialUpdatedAt)
  const [busy, setBusy] = useState(false)
  const dirty = note.trim() !== initialNote.trim()

  async function save() {
    setBusy(true)
    try {
      const res = await fetch('/api/pharmacy/patient-note', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, note: note.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error)
      setSavedAt(note.trim() ? new Date().toISOString() : null)
      toast.success(note.trim() ? '메모를 저장했어요' : '메모를 비웠어요')
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : '저장 실패') }
    finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)] px-5 py-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-yc-neutral900">특이사항 · 약국 메모</p>
        {savedAt && <span className="text-xs text-yc-neutral400">수정 {timeAgo(savedAt)}</span>}
      </div>
      <textarea
        value={note} onChange={e => setNote(e.target.value)}
        maxLength={500} rows={3} aria-label="환자 특이사항 메모"
        placeholder="이 환자의 특이사항을 적어두세요 (예: 어머니가 대신 픽업 · 전화 선호)"
        className="w-full px-3 py-2 border border-yc-neutral200 rounded-yc-md text-sm focus:outline-none focus:border-yc-green600 resize-none"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-yc-neutral400">약국 내부 메모예요. 환자에게는 보이지 않아요.</p>
        <button onClick={save} disabled={busy || !dirty}
          className="min-h-[44px] px-4 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50">
          저장
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 환자 상세에서 메모 로드 + 카드 마운트**

`src/app/pharmacy/(app)/patients/[id]/page.tsx`:

(a) 상단 import에 추가:
```ts
import PatientNoteCard from '../../patient-note-card'
```

(b) meds 쿼리 블록(라인 90~99) 다음에 약국 id + 기존 메모 로드 추가:
```ts
  // 약국 비공개 메모 로드(약사 본인 약국 기준)
  const { data: myPharmacy } = await supabase
    .from('pharmacies').select('id').eq('owner_id', user.id).maybeSingle()
  let noteText = ''
  let noteUpdatedAt: string | null = null
  if (myPharmacy?.id) {
    const { data: noteRow } = await supabase
      .from('pharmacy_patient_notes')
      .select('note, updated_at')
      .eq('pharmacy_id', myPharmacy.id)
      .eq('patient_id', id)
      .maybeSingle()
    noteText = noteRow?.note ?? ''
    noteUpdatedAt = noteRow?.updated_at ?? null
  }
```

(c) 가시(동의) 분기의 return에서 헤더 div(라인 122~126의 `</div>`) 다음, 첫 약 섹션 앞에 카드 삽입:
```tsx
      <PatientNoteCard patientId={id} initialNote={noteText} initialUpdatedAt={noteUpdatedAt} />
```

(import 경로 주의: 파일이 `patients/[id]/page.tsx`이고 카드가 `(app)/patient-note-card.tsx`이므로 상대경로 `../../patient-note-card`.)

- [ ] **Step 3: 검증**

Run: `npx tsc --noEmit && npm run lint`
Expected: 둘 다 exit 0

- [ ] **Step 4: 커밋**

```bash
git add "src/app/pharmacy/(app)/patient-note-card.tsx" "src/app/pharmacy/(app)/patients/[id]/page.tsx"
git commit -m "feat(pharmacy): 환자 상세에 특이사항 메모 카드"
```

---

### Task 4: 통합 검증 (실토큰 + RLS + 빌드)

**Files:** Create(임시, 커밋 안 함): 스크래치패드 검증 스크립트

- [ ] **Step 1: 검증 스크립트 작성·실행**

스크래치패드에 `verify-note.mjs` 작성. 약사 `ycorey@naver.com`/`kims3610`, 약국 `56b182b8-003f-438b-b5ff-332342021fba`, 동의환자 gmail `894111c9-bd92-4c36-b897-194d35b5d955`, 미동의환자 daum `cb3e283d-1798-4394-80ee-eb8f2d1debad`:

```js
import { readFileSync } from 'fs'; import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
const ROOT='C:/Users/main/yaksaro-care'; const env={}
readFileSync(resolve(ROOT,'.env.local'),'utf-8').split('\n').forEach(l=>{const[k,...v]=l.split('=');if(k&&!k.startsWith('#'))env[k.trim()]=v.join('=').trim()})
const URL=env['NEXT_PUBLIC_SUPABASE_URL'],ANON=env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
const admin=createClient(URL,env['SUPABASE_SERVICE_ROLE_KEY'],{auth:{persistSession:false}})
const PHID='56b182b8-003f-438b-b5ff-332342021fba'
const GMAIL='894111c9-bd92-4c36-b897-194d35b5d955', DAUM='cb3e283d-1798-4394-80ee-eb8f2d1debad'
let pass=0,fail=0; const ok=(c,m)=>{console.log((c?'  PASS ':'  FAIL ')+m);c?pass++:fail++}
const {data:a}=await createClient(URL,ANON,{auth:{persistSession:false}}).auth.signInWithPassword({email:'ycorey@naver.com',password:'kims3610'})
const ph=createClient(URL,ANON,{global:{headers:{Authorization:`Bearer ${a.session.access_token}`}},auth:{persistSession:false}})
// 1) 동의환자 upsert
let r=await ph.from('pharmacy_patient_notes').upsert({pharmacy_id:PHID,patient_id:GMAIL,note:'어머니 대신 픽업',updated_at:new Date().toISOString()},{onConflict:'pharmacy_id,patient_id'})
ok(!r.error,`동의환자 메모 upsert (err: ${r.error?.message||'없음'})`)
// 2) 재조회 일치
let s=await ph.from('pharmacy_patient_notes').select('note').eq('pharmacy_id',PHID).eq('patient_id',GMAIL).maybeSingle()
ok(s.data?.note==='어머니 대신 픽업',`재조회 일치 (got: ${s.data?.note})`)
// 3) 미동의환자 insert 차단(RLS)
let d=await ph.from('pharmacy_patient_notes').upsert({pharmacy_id:PHID,patient_id:DAUM,note:'x',updated_at:new Date().toISOString()},{onConflict:'pharmacy_id,patient_id'})
ok(!!d.error,`미동의환자 메모 차단 (err: ${d.error?.message||'⛔ 통과됨(누수)'})`)
// 4) 빈값 삭제
await ph.from('pharmacy_patient_notes').delete().eq('pharmacy_id',PHID).eq('patient_id',GMAIL)
let s2=await admin.from('pharmacy_patient_notes').select('note').eq('pharmacy_id',PHID).eq('patient_id',GMAIL).maybeSingle()
ok(!s2.data,`삭제 확인 (남음: ${s2.data?.note??'없음'})`)
console.log(`\n결과: ${pass} PASS / ${fail} FAIL`); process.exit(fail?1:0)
```

Run: `cd C:/Users/main/yaksaro-care && node <스크래치패드>/verify-note.mjs`
Expected: 4 PASS / 0 FAIL (미동의환자 차단 PASS = 누수 0)

- [ ] **Step 2: 빌드**

Run: `cd C:/Users/main/yaksaro-care && npm run build`
Expected: exit 0

- [ ] **Step 3: 임시 스크립트 미커밋 확인**

`git status`로 의도한 변경만 있는지 확인. 스크래치패드 스크립트는 레포 밖이라 커밋 대상 아님.

---

## Self-Review (작성자 체크)

- **Spec coverage**: 데이터모델+RLS(T1, delete 정책 추가)·PUT upsert/삭제(T2)·UI 카드+상세연결(T3)·검증(T4). 스펙 전 섹션 매핑.
- **Placeholder scan**: 모든 코드 스텝에 실제 코드. 없음.
- **Type consistency**: API `{ patientId, note }` ↔ 카드 fetch body 일치. 카드 props `initialNote`/`initialUpdatedAt` ↔ page.tsx 전달 `noteText`/`noteUpdatedAt` 일치. import 경로 `../../patient-note-card` 확인.
- **주의**: 미동의 환자 차단은 RLS upsert insert/update with check(`pharmacist_can_view`)에 의존 — T4 Step1의 케이스3가 실토큰으로 검증.
