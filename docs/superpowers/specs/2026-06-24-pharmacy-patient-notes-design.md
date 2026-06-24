# 약국 환자 특이사항 메모 (약사 비공개)

- 작성일: 2026-06-24
- 상태: 설계 승인됨(구현 대기)
- 관련: 014/031 약사 RLS, `pharmacist_can_view()`, 환자 상세 `app/pharmacy/(app)/patients/[id]/page.tsx`

## 배경 / 문제

약사 모드는 read-only 대시보드라 약사가 단골 환자에 대해 메모할 곳이 없다. 약국 운영상 "특이사항"(예: "어머니가 대신 픽업", "전화 선호", "OO 언급")을 환자별로 적어두고 싶다.

## 제약

- **약사 비공개**: 환자에게 보이지 않는 약국 내부 CRM 메모. (환자 공유는 별개 기능 — 비목표)
- **read-only 정신 최소 침해**: 새 쓰기 경로는 약사가 *자기 약국·동의 환자*에 한해, *별도 테이블*에만 쓴다(환자 소유 데이터는 불변 유지).
- 자유 텍스트(약국 자체 관리 메모이므로 임상 금칙어 게이트 불필요). 단 길이 제한.

## 목표 / 비목표

**목표**
- 약사가 환자 상세 화면에서 그 환자에 대한 **단일 메모(특이사항)**를 작성·수정.
- (pharmacy, patient) 쌍당 메모 1개(덮어쓰기).
- 약국·동의 게이트로 접근 제한. 환자는 절대 못 봄.

**비목표**
- 환자에게 메모 노출 / 타임스탬프 누적 로그(여러 메모) / 임상 기록·복약지도 문서화.

## 데이터 모델 (마이그레이션 039)

```sql
create table if not exists public.pharmacy_patient_notes (
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  patient_id  uuid not null references auth.users(id)        on delete cascade,
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (pharmacy_id, patient_id)
);
```

- PK가 (pharmacy_id, patient_id) → 쌍당 1행(단일 메모) 보장.
- CASCADE: 약국 삭제·환자 탈퇴 시 메모 자동 삭제.

## RLS (약사 전용 + 동의 게이트)

```sql
alter table public.pharmacy_patient_notes enable row level security;

-- 약사: 자기 약국 + 동의·연결된 환자에 한해 조회/작성/수정
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

create index if not exists idx_ppn_pharmacy on public.pharmacy_patient_notes(pharmacy_id);
```

- **환자 정책 없음** → 환자는 RLS상 이 테이블 접근 0(비공개).
- 동의 철회 시 `pharmacist_can_view`가 false → 약사도 조회 0(메모 삭제는 아님, 비노출).
- `pharmacist_can_view`는 SECURITY DEFINER(014)로 관계 AND 동의를 검사 — 재사용.

## API

### `PUT /api/pharmacy/patient-note` (신규)
- 인증: 약사 사용자 토큰 + RLS.
- 입력: `{ patientId: string, note: string }`.
- 검증: `note` 트림·≤500. 빈 문자열이면 행 삭제(메모 비우기), 아니면 upsert.
- 처리(upsert): 약사 본인 약국 id를 서버에서 조회(`pharmacies.owner_id = user.id`) → `pharmacy_patient_notes` upsert(pharmacy_id, patient_id, note, updated_at=now). RLS가 동의·소유 게이트.
- 약국 계정 아님/약국 없음 → 403.

## UI — 환자 상세(`app/pharmacy/(app)/patients/[id]/page.tsx` + 신규 클라이언트 컴포넌트)

- 페이지(서버)에서 약사 약국 id + 기존 메모를 로드해 컴포넌트에 전달.
- 환자명 아래(복약 목록 위)에 **"특이사항 · 약국 메모"** 카드:
  - 기존 메모 표시 + `textarea`(maxLength 500) + 저장 버튼(min-h-[48px]).
  - `updated_at` 있으면 "수정: N시간 전" 상대시각.
  - 안내 한 줄: "약국 내부 메모예요. 환자에게는 보이지 않아요."
  - 저장 시 `PUT /api/pharmacy/patient-note` 호출, sonner 토스트.
- 신규 클라이언트 컴포넌트 `patient-note-card.tsx`(textarea·저장 상태·fetch).
- 색 yc-* 토큰만.

## 접근 불가 처리
- 환자 상세 페이지는 이미 미동의/타약국 시 "볼 수 없는 환자" 빈 상태를 렌더(기존). 메모 카드는 환자 데이터가 보이는 경우(동의)에만 노출 → 그 분기 안쪽에 배치.

## 테스트 / 검증
- tsc·lint·next build exit 0.
- 실토큰(약사 naver/kims3610): 동의 환자(gmail)에 메모 upsert→재조회 일치, 빈 값→삭제 확인.
- RLS: 약사 토큰으로 미동의/타약국 환자 메모 select/insert 0건(누수 0). service_role 아님.

## 영향 범위 (파일)
- `supabase/migrations/039_pharmacy_patient_notes.sql` (신규)
- `src/app/api/pharmacy/patient-note/route.ts` (신규, PUT)
- `src/app/pharmacy/(app)/patients/[id]/page.tsx` (메모 로드 + 카드 마운트)
- `src/app/pharmacy/(app)/patient-note-card.tsx` (신규 클라이언트)
- `src/types/database.ts` (pharmacy_patient_notes 추가)
