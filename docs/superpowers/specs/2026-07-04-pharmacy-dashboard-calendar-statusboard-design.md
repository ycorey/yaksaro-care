# 약사 대시보드 재구성 — 캘린더 + 현황판 + 환자별 요청 아코디언

**작성일:** 2026-07-04
**대상:** `src/app/pharmacy/(app)/` (약사 read-only 대시보드)
**관련 하네스:** 약사 모드(pharmacist-mode) — 규제·동의·RLS 게이트 유지

---

## 1. 목표 / 배경

현재 약사 대시보드(`/pharmacy`)는 데스크톱 2컬럼이다.

- **좌:** 알림 켜기 + 환자 요청함(마감 버킷: 지연/오늘/내일/이번주/이후)
- **우:** 환자 목록 + QR

사용자(약국 운영 약사)가 원하는 재구성:

1. **환자 요청을 각 단골 환자 안으로 귀속** — 요청함을 별도 패널로 두지 않고, 목록의 각 환자 행 안에서 그 환자의 요청을 처리한다.
2. **새 요청이 온 환자는 목록에서 깜박이는 애니메이션으로 인지**시킨다.
3. **비워진 좌측 자리에 캘린더** — 요청 마감 + 리필/재방문 예정을 날짜별로 표시.
4. 캘린더 아래 **현황판** — 약사가 지금 챙겨야 할 것들: 오늘 할 일(자동+수동), 리필 임박, 지연 요청, 최근 연결된 단골.

핵심 제약: 앱에는 "환자 방문" 데이터가 없다. 방문 대신 **이미 존재하는 신호**(요청 마감일, 리필 계산, 공개 동의 시각)로 현황을 구성한다. 새 저장은 **수동 메모(pharmacy_todos)** 하나뿐이다.

---

## 2. 최종 레이아웃

### 데스크톱 (lg, 좌/우 뒤바뀜)

```
단골 환자 복약 현황
──────────────────────────────────────────────
┌─ 좌 (340–420px) ────┐   ┌─ 우 (1fr) ─────────────┐
│ 📅 캘린더            │   │ 🔔 새 요청 알림 켜기       │
│   요청 마감·리필 점    │   │ ── 환자 목록 ─────────    │
│                     │   │   검색                   │
│ ── 현황판 ──         │   │   김상우  🔴요청2 약4종 ▾  │  ← 깜박임
│ ✅ 오늘 할 일         │   │   ╭ 요청 아코디언(답장…) ╮ │
│   자동 N건 + 수동메모  │   │   이영희      약2종     ▸  │
│ 💊 리필 임박 N명      │   │                        │
│ ⏰ 지연 요청 N건      │   │ [우리 약국 QR]          │
│ 🆕 최근 연결 N명      │   └───────────────────────┘
└─────────────────────┘
```

### 모바일 (액션 우선 세로 스택)

`오늘 할 일 → 캘린더 → 현황판(리필/지연/최근연결) → 알림 켜기 → 환자 목록 → QR`

기존 요청함(`PharmacyRequestInbox`) 단독 컴포넌트는 은퇴한다. 요청 처리 UI(카드)는 재사용을 위해 공용으로 추출한다.

---

## 3. 컴포넌트 구조

| 파일 | 종류 | 책임 |
|------|------|------|
| `pharmacy-calendar.tsx` (신규) | client | 월 그리드. 날짜별 점(요청 마감=주황, 리필=초록), 오늘 강조, 날짜 탭 시 그 날 항목 목록을 그리드 아래 인라인 표시. |
| `pharmacy-status-board.tsx` (신규) | client | 4개 블록 컨테이너. 파생 데이터(자동 할일·리필·지연·최근연결)는 props로 받고, 수동 할일은 자식 컴포넌트에 위임. |
| `pharmacy-todo-list.tsx` (신규) | client | 수동 메모 CRUD (`/api/pharmacy/todo`). 입력·체크·삭제. |
| `pharmacy-request-card.tsx` (신규) | client | 요청 1건 카드(답장·전화·마감·완료). 기존 인박스에서 카드 로직 추출. |
| `pharmacy-patient-list.tsx` (수정) | client | 각 행을 아코디언化. open 요청 있으면 깜박임+배지. 펼치면 그 환자의 `PharmacyRequestCard[]` 렌더. |
| `page.tsx` (수정) | server | 쿼리 확장(연결 시각·리필용 처방 필드·약국 id·todos) + 환자별 요청/리필 매핑 + 캘린더/현황판 데이터 조립. |
| `pharmacy-request-inbox.tsx` (제거) | — | 카드 로직을 `pharmacy-request-card.tsx`로 이관 후 삭제. |

### 단위 경계

- **PharmacyRequestCard**: 입력=요청 1건 + 콜백들(onReply/onStatus/onDue). 출력=처리 UI. 내부 상태는 draft/busy만. 리스트/인박스와 무관하게 단독 테스트 가능.
- **PharmacyPatientList**: 입력=환자행[](+각 환자의 요청[]). 검색·아코디언·깜박임 표시만. 요청 처리는 카드에 위임.
- **PharmacyCalendar**: 입력=`{date: 'YYYY-MM-DD', requests: n, refills: n}[]` + today. 순수 표시.
- **PharmacyStatusBoard / TodoList**: 파생 블록은 표시, 수동 할일은 API로 CRUD.

---

## 4. 데이터 소스 (마이그레이션 최소화)

| 블록/기능 | 소스 | 마이그레이션 |
|-----------|------|--------------|
| 캘린더 — 요청 마감 | 이미 조회한 `reqs`의 `due_date` | 없음 |
| 캘린더 — 리필 예정 | `computeRefillSoon()` 결과의 만료일 | 없음(refill.ts에 `expiryDate` ISO 필드 추가 — 가산·하위호환) |
| 오늘 할 일(자동) | 오늘 마감 요청 + 답장 대기(open·미답장) + 오늘 리필 → 파생, 클릭 시 해당 환자로 이동 | 없음 |
| 오늘 할 일(수동) | `pharmacy_todos` 신규 테이블 | **045** |
| 리필 임박 | `computeRefillSoon()` 환자별 재사용 | 없음 |
| 지연 요청 | `reqs`에서 `bucketByDue()==='overdue'` | 없음 |
| 최근 연결된 단골 | `profiles.consent_pharmacist_view_at DESC` (기존 컬럼) | 없음 |
| 환자별 요청 귀속 | `reqs`를 `patient_id`로 그룹핑 | 없음 |

### page.tsx 쿼리 변경

- `profiles` select에 `consent_pharmacist_view_at` 추가 (최근 연결 정렬용).
- `user_medications` select를 리필 계산까지 겸하도록 확장:
  `total_days, custom_name, drug:drugs(item_name), prescription:user_prescriptions(id, prescribed_at, duration_days, hospital_name)` — 기존 `member_id` 필터(본인 멤버) 유지. 결과를 `user_id`로 그룹핑해 (a) 복약 종수 카운트, (b) `computeRefillSoon()` 환자별 실행 둘 다 처리(추가 쿼리 없음).
- 약사의 **약국 id** 조회: `select id from pharmacies where owner_id = user.id`.
- 약국 todos 조회(또는 클라에서 API GET).

---

## 5. 마이그레이션 045 — `pharmacy_todos`

```sql
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

-- 약국 owner(약사 본인)만 전권. pharmacy_id는 auth.uid()가 소유한 약국이어야 함.
create policy pharmacy_todos_owner_all on public.pharmacy_todos
  for all
  using  (pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid()))
  with check (pharmacy_id in (select id from public.pharmacies where owner_id = auth.uid()));
```

- 환자 비노출(약국 내부 메모). service_role 우회 없음 — 사용자(약사) 토큰 + RLS.
- 운영 DB 적용은 MCP `apply_migration` 승인 게이트로.

---

## 6. API — `/api/pharmacy/todo`

사용자(약사) 토큰 + RLS. 약국은 `auth.uid()` 소유로 RLS가 자동 스코핑.

| 메서드 | 입력 | 동작 |
|--------|------|------|
| `GET` | — | 내 약국 todos: 미완료 전체 + 최근 완료 5건 |
| `POST` | `{ text }` | 삽입(1~200자 검증). pharmacy_id는 서버가 owner 약국으로 채움 |
| `PATCH` | `{ id, done }` | 완료 토글(+`done_at`) |
| `DELETE`| `{ id }` | 삭제 |

빈/초과 텍스트는 400. 약국 미소유(약사 아님) 시 403.

---

## 7. 깜박임 애니메이션

`globals.css`에 키프레임 추가:

```css
@keyframes ycRequestBlink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
```

- 적용: open(신규/미답장) 요청이 있는 환자 행의 **빨간 점(●) 배지**에 `animation: ycRequestBlink 1.1s ease-in-out infinite`. 행 전체가 아니라 점+"요청 N" 배지에만 걸어 과하지 않게.
- `transform/opacity`만 사용(성능 기준 준수).
- 기존 `@media (prefers-reduced-motion: reduce)` 블록이 `animation-iteration-count:1`로 자동 무력화 → 전정기관 민감 사용자 보호(추가 코드 불필요).

---

## 8. 규제 · 보안 · 격리 (불변)

- **읽기 전용** 성격·"의학적 판단 대체 아님" 면책 문구 하단 유지.
- **가족 격리**: 요청 카드는 `isFamily` 플래그만 표기, 가족 이름·약명 비노출(기존 규칙). 리필/복약 카운트는 본인(is_self) 멤버만.
- 모든 조회는 **사용자(약사) 토큰 + RLS** — service_role 우회 없음.
- `pharmacy_todos`는 약국 내부용, 환자에게 노출 안 됨.
- 비임상 소통 원칙 유지: 답장은 예약·물류 안내용, 복약 상담은 전화·대면 라우팅.

---

## 9. 검증

- **단위**: `computeRefillSoon` 만료일(ISO) 추가분, 오늘 할 일 자동 파생 로직, `bucketByDue` 지연 필터.
- **보안 e2e**(기존 `e2e/` 패턴): 약사 토큰으로 (a) 타 약국 todo INSERT/SELECT 0건, (b) 미동의 환자 요청·복약 0건, (c) 가족 약명 비노출.
- **회귀 게이트**: `tsc` · `lint` · `next build` 통과.
- **실기기**: 새 요청 도착 시 해당 환자 깜박임, 아코디언 펼쳐 답장·완료, 캘린더 점 정확성.

---

## 10. 범위 밖 (YAGNI)

- 복약 순응도 주의 블록(현황판 후보였으나 미채택).
- 방문 기록 테이블 신설.
- 캘린더 드래그·기간 편집(점+날짜탭 목록까지만).
- 요청의 환자 상세페이지 이관(아코디언으로 대체).
