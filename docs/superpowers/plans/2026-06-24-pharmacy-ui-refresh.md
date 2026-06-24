# 약국(B2B) 앱 UI 세련화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 약국 화면을 기존 디자인 시스템 안에서 B2B 데스크톱에 맞게 정돈·세련화한다(Foundation 정돈 + 컴팩트 오퍼레이션).

**Architecture:** YC 공용 컴포넌트(YCCard에 lg variant 추가, PharmacistBadge 신규)를 먼저 만들고, 약국 화면들이 이를 재사용하도록 교체하면서 폭 확장·2컬럼·컴팩트 밀도·토큰 일관화를 적용한다.

**Tech Stack:** Next.js 16.2.6(App Router) · Tailwind v4(yc-* 토큰) · @phosphor-icons/react · TypeScript

## Global Constraints

- yc-* 토큰만, 하드코딩 hex 금지. 새 색 토큰 없음(YCCard radius variant만).
- 기능·데이터·RLS·규제 문구 보존(표현만).
- 환자앱/공용 컴포넌트의 기존(환자측) 동작 불변 — YCCard 변경은 **새 variant 추가(후방호환)**만.
- 검증(레포 표준, 단위테스트 없음): 각 태스크 `npx tsc --noEmit` exit 0 + `npm run lint` exit 0. 최종 `npm run build` exit 0.
- 참조 스펙: `docs/superpowers/specs/2026-06-24-pharmacy-ui-refresh-design.md`.
- 각 구현자는 편집 전 해당 파일을 Read로 확인하고, 명시된 부분만 정확히 바꾼다(기존 기능 비파괴).

---

### Task 1: 공용 컴포넌트 — YCCard lg variant + PharmacistBadge

**Files:**
- Modify: `src/components/yc/yc-card.tsx`
- Create: `src/components/yc/pharmacist-badge.tsx`

**Interfaces:**
- Produces: `<YCCard radius="lg">`(=`rounded-yc-lg`) — 기본값은 기존(md) 유지. `<PharmacistBadge />` — "약사" 칩.

- [ ] **Step 1: YCCard에 radius variant 추가**

`src/components/yc/yc-card.tsx`를 Read. 현재 카드 radius가 `rounded-yc-md` 고정이다. props에 `radius?: 'md' | 'lg'`(기본 `'md'`)를 추가하고, className의 `rounded-yc-md`를 `radius === 'lg' ? 'rounded-yc-lg' : 'rounded-yc-md'`로 분기. **기본값 md 유지 → 환자앱 기존 사용처 영향 없음.** 다른 variant(default/brand/dark) 로직은 보존.

- [ ] **Step 2: PharmacistBadge 작성**

`src/components/yc/pharmacist-badge.tsx`:
```tsx
// 약사 식별 칩 — layout/login 중복 마크업 통합(text-[11px] rounded-full → 토큰화)
export function PharmacistBadge() {
  return (
    <span className="text-xs font-bold text-yc-green700 bg-yc-green50 px-2 py-0.5 rounded-yc-sm">
      약사
    </span>
  )
}
```

- [ ] **Step 3: 검증**

Run: `npx tsc --noEmit && npm run lint`
Expected: 둘 다 exit 0

- [ ] **Step 4: 커밋**

```bash
git add src/components/yc/yc-card.tsx src/components/yc/pharmacist-badge.tsx
git commit -m "feat(yc): YCCard lg radius variant + PharmacistBadge 공용화"
```

---

### Task 2: 로그인 페이지 정돈 (F1·F2·F5 + 약사칩)

**Files:**
- Modify: `src/app/pharmacy/login/page.tsx`

**Interfaces:**
- Consumes: `PharmacistBadge` from `@/components/yc/pharmacist-badge`.

- [ ] **Step 1: radius·focus ring·칩 교체**

`src/app/pharmacy/login/page.tsx`를 Read 후 정확히 교체:
- `focus:ring-yc-green400` → `focus:ring-yc-green600` (입력 2곳, F1 버그)
- 카드 `rounded-2xl` → `rounded-yc-xl`
- 입력·에러박스 `rounded-xl` → `rounded-yc-md`
- 제출 버튼 `rounded-2xl` → `rounded-yc-lg`
- "약사" 칩 인라인 마크업(`text-[11px] ... rounded-full`)을 `<PharmacistBadge />`로 교체(import 추가)
- 카드 패딩 `p-8` → `p-6`(B2B 밀도, L3)
- 개인 이메일 안내 문구는 **변경하지 않음**(사업 연락처 — 범위 외)

- [ ] **Step 2: 검증**

Run: `npx tsc --noEmit && npm run lint`
Expected: 둘 다 exit 0

- [ ] **Step 3: 커밋**

```bash
git add src/app/pharmacy/login/page.tsx
git commit -m "fix/ui(pharmacy-login): focus ring 버그·radius 토큰화·약사칩·밀도"
```

---

### Task 3: 레이아웃 + 아이콘 (A1·L5·F6)

**Files:**
- Modify: `src/app/pharmacy/(app)/layout.tsx`
- Modify: `src/app/pharmacy/(app)/pharmacy-icons.tsx`

**Interfaces:**
- Consumes: `PharmacistBadge`.

- [ ] **Step 1: layout 폭·약국명·칩**

`layout.tsx` Read 후:
- 헤더·main 컨테이너 `max-w-3xl` → `max-w-5xl` (A1)
- 약국명 `hidden sm:block` → `hidden md:block`로 더 일찍 노출(L5) (또는 항상 표시가 어려우면 md). 
- "약사" 칩 인라인(`text-[11px] rounded-full`) → `<PharmacistBadge />`(import 추가)

- [ ] **Step 2: 빈 상태 아이콘 의미 수정 + weight 통일**

`pharmacy-icons.tsx` Read 후:
- `PharmacyEmptyIcon`의 `Hospital`(병원, 의미 어긋남) → `UsersThree`(또는 `Users`) (F6). import 교체.
- 아이콘 weight 규칙 통일: 기능 아이콘 `fill`, 빈 상태/잠금 등 비기능 아이콘 `regular`로 1규칙 적용(현재 `light` 혼용 정리). 시각 톤만, 의미 보존.

- [ ] **Step 3: 검증**

Run: `npx tsc --noEmit && npm run lint`
Expected: 둘 다 exit 0

- [ ] **Step 4: 커밋**

```bash
git add "src/app/pharmacy/(app)/layout.tsx" "src/app/pharmacy/(app)/pharmacy-icons.tsx"
git commit -m "ui(pharmacy): max-w-5xl·약국명 노출·빈상태 아이콘/weight 정돈"
```

---

### Task 4: 대시보드 2컬럼 + 배치 (A2·A5·A4 헤딩) + 알림 톤다운

**Files:**
- Modify: `src/app/pharmacy/(app)/page.tsx`
- Modify: `src/app/pharmacy/(app)/pharmacist-notify.tsx`

**Interfaces:**
- Consumes: 기존 PharmacyRequestInbox·PharmacyPatientList·DashboardPoll.

- [ ] **Step 1: 대시보드 데스크톱 2컬럼 + 섹션 배치**

`page.tsx` Read 후 렌더 구조 조정(데이터 로직 불변):
- 데스크톱(lg) 2컬럼: **좌=요청함(PharmacyRequestInbox), 우=환자목록(PharmacyPatientList)**. 모바일은 단일 스택(요청함 먼저) 유지.
  - 예: 헤더 아래를 `<div className="lg:grid lg:grid-cols-[minmax(340px,420px)_1fr] lg:gap-6 space-y-5 lg:space-y-0">` 로 감싸고 좌/우 컬럼 분배. PharmacistNotify는 좌 컬럼 상단(요청함 위 작게) 또는 헤더 아래.
- **QR 카드**: 본문 최상단 → 환자목록(우 컬럼) **하단**으로 이동(노출 비중 ↓, A5).
- 면책 고지 `<p>`: `border-t border-yc-neutral100 pt-4 mt-8`로 분리(A5).
- 부제는 기존 "처리할 요청 N건 · 단골 환자 M명" 유지.

- [ ] **Step 2: 섹션 헤딩 위계(A4) + 알림 톤다운**

- `page.tsx`/하위에서 h2급 섹션 제목이 `text-base font-bold`이면 `text-lg font-bold`로(요청함 제목 포함 — 단 요청함 제목은 Task 5에서 다룰 수 있으니 page.tsx 내 제목만).
- `pharmacist-notify.tsx` Read 후 카드 배경 `bg-yc-green50 border-yc-green100` → `bg-white border border-yc-green100`로 톤다운(요청함과 색 경쟁 완화, A5). 텍스트·버튼 동작 보존.

- [ ] **Step 3: 검증**

Run: `npx tsc --noEmit && npm run lint`
Expected: 둘 다 exit 0

- [ ] **Step 4: 커밋**

```bash
git add "src/app/pharmacy/(app)/page.tsx" "src/app/pharmacy/(app)/pharmacist-notify.tsx"
git commit -m "ui(pharmacy): 대시보드 데스크톱 2컬럼·QR/면책 배치·알림 톤다운"
```

---

### Task 5: 요청함 + 환자 목록/상세 컴팩트 (F3·F4·A3·A4·A6)

**Files:**
- Modify: `src/app/pharmacy/(app)/pharmacy-request-inbox.tsx`
- Modify: `src/app/pharmacy/(app)/pharmacy-patient-list.tsx`
- Modify: `src/app/pharmacy/(app)/patients/[id]/page.tsx`

**Interfaces:**
- Consumes: `YCCard`(radius="lg") from `@/components/yc/yc-card`, `CaretDown`/`CaretRight` from `@phosphor-icons/react`.

- [ ] **Step 1: 요청함 정돈**

`pharmacy-request-inbox.tsx` Read 후:
- 상태배지·카운터 배지 `rounded-full` → `rounded-yc-sm`(F4 일관). 색 클래스 유지.
- "환자 요청" 제목 `text-base font-bold` → `text-lg font-bold`(A4).
- 최근 처리 `<details>/<summary>`(브라우저 기본 화살표) → `useState` 토글 + Phosphor `CaretDown`(회전) 커스텀(A6). 내용·항목 보존.
- 요청 카드 컨테이너 마크업을 `<YCCard radius="lg" className="px-4 py-3 space-y-2">`로 교체(F3, 패딩 컴팩트). (회신 입력·버튼·배지 내부 동작 보존)

- [ ] **Step 2: 환자 목록 컴팩트**

`pharmacy-patient-list.tsx` Read 후:
- 행 높이 `py-4` → `py-2.5`(A3).
- 원형 아바타(`w-10 h-10 rounded-full bg-yc-green50` 이니셜) → 제거하거나 `w-8 h-8 rounded-yc-sm bg-yc-neutral100` 이니셜 텍스트로 축소(A3). 요청 배지(hasRequest)·약 종수 유지.
- `›` 유니코드 → Phosphor `CaretRight`(size 16, text-yc-neutral400).
- 목록 컨테이너 카드는 `<YCCard radius="lg">`로(F3) — divide-y 행 구조 유지.

- [ ] **Step 3: 환자 상세 밀도**

`patients/[id]/page.tsx` Read 후:
- 복약 카드 약명 `text-lg font-bold` → `text-base font-semibold`(A4).
- 카드 그룹 컨테이너(`bg-white rounded-yc-lg border ...`)를 `<YCCard radius="lg">`로(F3).
- 면책 `<p>` → `border-t border-yc-neutral100 pt-4 mt-8` 분리(A5).
- `‹ 목록으로` 백링크는 유지(텍스트 변경 불필요).

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit && npm run lint`
Expected: 둘 다 exit 0

- [ ] **Step 5: 커밋**

```bash
git add "src/app/pharmacy/(app)/pharmacy-request-inbox.tsx" "src/app/pharmacy/(app)/pharmacy-patient-list.tsx" "src/app/pharmacy/(app)/patients/[id]/page.tsx"
git commit -m "ui(pharmacy): 요청함·환자목록/상세 컴팩트·YCCard 흡수·배지/토글 일관"
```

---

### Task 6: 최종 검증 (빌드 + 회귀)

- [ ] **Step 1: 빌드**

Run: `cd C:/Users/main/yaksaro-care && npm run build`
Expected: exit 0 (전 약국 라우트 컴파일)

- [ ] **Step 2: 환자앱 회귀 점검**

`src/components/yc/yc-card.tsx` 변경이 기본 variant(md)를 유지하는지 확인 — 환자앱에서 YCCard를 radius 미지정으로 쓰면 기존과 동일(md)이어야 함. grep으로 `<YCCard`의 기존 사용처가 radius prop 없이 쓰이는지 확인, tsc 통과로 props 호환 보증.

- [ ] **Step 3: 약국 화면 확인(가능 시)**

약사 로그인(naver/kims3610) 또는 빌드 라우트 목록에서 `/pharmacy`, `/pharmacy/login`, `/pharmacy/patients/[id]`가 정상 컴파일됐는지 확인. 2컬럼·컴팩트·로그인 포커스 링 시각 확인(수동/스크린샷).

---

## Self-Review (작성자 체크)

- **Spec coverage**: F1·F2(Task2)·F3(YCCard, Task1+5)·F4(Task5)·F5(Task2 버튼·전반)·F6(Task3) · A1(Task3)·A2(Task4)·A3(Task5)·A4(Task4/5)·A5(Task4/5)·A6(Task5). 전 항목 매핑.
- **Placeholder scan**: 각 스텝에 구체 class/컴포넌트 지시. "적절히" 없음. (UI 특성상 전체 파일 코드 대신 정확한 before→after 토큰/마크업 지시 — 구현자 Read 전제.)
- **Type consistency**: `YCCard radius="lg"`(Task1 정의 ↔ Task5 사용), `PharmacistBadge`(Task1 ↔ Task2/3). import 경로 `@/components/yc/*`.
- **순서**: Task 1(공용 컴포넌트)이 먼저 — Task 2/3/5가 PharmacistBadge·YCCard lg에 의존. Task 4는 독립. Task 5는 YCCard lg(Task1) 의존.
- **주의**: 버튼 전면 YCButton 치환은 범위에서 제외(스펙 비고) — Task2/5는 높이/토큰 정규화 수준만.
