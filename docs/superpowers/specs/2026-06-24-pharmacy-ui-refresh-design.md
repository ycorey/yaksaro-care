# 약국(B2B) 앱 UI 세련화 — Foundation 정돈 + 컴팩트 오퍼레이션(방향 A)

- 작성일: 2026-06-24
- 상태: 설계 승인됨(구현 대기)
- 근거: 디자이너 비주얼 진단 + 디자인시스템 일관성 감사(세션 내 2개 에이전트)

## 배경 / 목표

약국 화면은 색 토큰(yc-*)은 쓰지만 공용 컴포넌트(YCCard/YCButton/YCBadge)를 0% 재사용하고, 모바일 환자앱 패턴을 물려받아 B2B 데스크톱에 어수선하다. 기존 디자인 시스템 안에서 **세련·정돈 + B2B 컴팩트**로 개선한다.

**비목표:** 새 디자인 시스템/페이지 배경 변경(방향 B)·사이드바 재설계(방향 C)·기능/데이터/규제 문구 변경.

## 제약 (Global)

- **yc-* 토큰만**(하드코딩 hex 금지). 새 색 토큰 추가 없음(YCCard `lg` radius variant만 허용).
- 기능·데이터·RLS·규제 문구 보존(표현만 변경).
- 환자앱(모바일/실버) 화면·공용 컴포넌트의 *환자 측* 동작 불변 — YC 컴포넌트 변경은 후방호환만.
- 검증(레포 표준): tsc·lint·next build exit 0. 시각은 빌드 라우트 확인 + 설명.

---

## 작업 (2개 층위)

### 층위 1 — Foundation 정돈 (버그·일관성, 방향 무관)

**F1. 토큰 버그 수정**
- `login/page.tsx`: `focus:ring-yc-green400`(미정의 → 포커스 링 무음 실패) → `focus:ring-yc-green600`. (입력 2곳)

**F2. 로그인 radius 시스템화**
- `login/page.tsx`: `rounded-2xl`→`rounded-yc-xl`, `rounded-xl`→`rounded-yc-md`(입력·에러박스), 제출버튼 `rounded-2xl`→`rounded-yc-lg`. Tailwind 기본 radius 제거.

**F3. 공용 카드 컴포넌트 흡수**
- `src/components/yc/yc-card.tsx`에 `radius` 또는 `lg` variant 추가(`rounded-yc-lg`). 약국 화면의 반복 카드 마크업(`bg-white rounded-yc-lg border border-yc-neutral100 shadow-[var(--yc-shadow-sm)]` ×9)을 `<YCCard>`(lg)로 교체. **환자앱 기존 YCCard(기본 md) 사용처는 영향 없음**(새 variant만 추가).

**F4. 상태배지 일관화**
- `pharmacy-request-inbox.tsx`의 수동 STATUS 배지(`rounded-full`)를 `rounded-yc-sm` 체계로 통일(YCBadge 사용 또는 동일 radius). 카운터 배지 포함. "약사" 칩(`layout.tsx`·`login/page.tsx`, `text-[11px] rounded-full` 중복)을 공유 `PharmacistBadge` 또는 `YCBadge variant="brand"`로 흡수, `text-[11px]`→`text-xs`.

**F5. 버튼 높이 정규화**
- 약국 버튼 높이 혼용(h-10/h-12/h-14)을 일관 규칙으로: 주요 액션 `min-h-[44px]~48px`, 로그인 제출 풀폭. (가능하면 YCButton 사용, 아니면 높이만 통일.)

**F6. 아이콘 정돈**
- `pharmacy-icons.tsx` 빈 상태 아이콘 `Hospital`(병원, 의미 어긋남) → `Users`/`UsersThree`. 아이콘 weight 규칙 통일(기능=fill, 빈상태/장식=regular 등 1규칙).

### 층위 2 — 컴팩트 오퍼레이션 (방향 A 비주얼)

**A1. 컨테이너 폭 확장**
- `layout.tsx`: `max-w-3xl` → `max-w-5xl`(헤더·main 양쪽). 데스크톱 활용.

**A2. 대시보드 데스크톱 2컬럼**
- `page.tsx`: 데스크톱(lg)에서 **요청함(좌) · 환자목록(우)** 2컬럼(`lg:grid lg:grid-cols-[minmax(340px,420px)_1fr] lg:gap-6`). 모바일은 기존 단일 스택 유지(요청함 먼저). PharmacistNotify·QR은 아래 A5 참조.

**A3. 환자 목록 컴팩트**
- `pharmacy-patient-list.tsx`: 행 높이 축소(py-4→py-2.5), 원형 아바타(`w-10 h-10 rounded-full bg-yc-green50`) 제거 또는 `rounded-yc-sm` 이니셜 텍스트 배지로 축소. 요청 배지(기존 hasRequest)·약 종수는 유지. `›` 유니코드 → Phosphor `CaretRight`.

**A4. 정보 밀도(타이포)**
- `patients/[id]/page.tsx`: 복약 약명 `text-lg font-bold` → `text-base font-semibold`(B2B 밀도). 카드 패딩 px-5 py-4 → px-4 py-3 검토.
- 섹션 헤딩(h2: page.tsx "환자 요청"·inbox 제목 등) `text-base font-bold` → `text-lg font-bold`(h1과의 위계 연속).

**A5. QR·알림·면책 배치 정돈**
- QR 카드: 대시보드 본문 상주 → 환자목록 하단 또는 헤더 우측 보조 링크(노출 비중 낮춤). (구조 최소 변경: 환자목록 섹션 끝으로 이동)
- PharmacistNotify: 요청함과 색 경쟁 완화 — `bg-yc-green50`→`bg-white border-yc-green100`로 톤다운(또는 요청함 아래 배치).
- 면책 고지(page.tsx·patients/[id]): 콘텐츠와 분리 `border-t border-yc-neutral100 pt-4 mt-8`.

**A6. 최근 처리 토글 커스텀화**
- `pharmacy-request-inbox.tsx` `<details>/<summary>`(브라우저 기본 화살표) → Phosphor `CaretDown` 커스텀 토글(나머지 UI와 일관).

---

## 영향 범위 (파일)
- `src/components/yc/yc-card.tsx` (lg variant 추가 — 후방호환)
- `src/app/pharmacy/(app)/layout.tsx` (max-w, 약국명 표시, 약사칩)
- `src/app/pharmacy/(app)/page.tsx` (2컬럼, 섹션 배치, 면책 분리)
- `src/app/pharmacy/(app)/pharmacy-request-inbox.tsx` (배지·토글·헤딩·YCCard)
- `src/app/pharmacy/(app)/pharmacy-patient-list.tsx` (컴팩트 행·아바타·CaretRight)
- `src/app/pharmacy/(app)/patients/[id]/page.tsx` (밀도·면책·YCCard)
- `src/app/pharmacy/(app)/pharmacist-notify.tsx` (톤다운)
- `src/app/pharmacy/(app)/pharmacy-icons.tsx`·`pharmacy-patient-icons.tsx` (아이콘 의미·weight)
- `src/app/pharmacy/login/page.tsx` (radius·focus ring·약사칩)
- (신규 가능) `src/app/pharmacy/(app)/pharmacist-badge.tsx` 또는 YCBadge 재사용

## 테스트 / 검증
- tsc·lint·next build exit 0.
- 환자앱(모바일) 화면 회귀 없음 확인(YCCard 기본 variant 불변).
- 약사 로그인(naver/kims3610) 실사용 또는 빌드 라우트 확인 — 2컬럼·컴팩트·로그인 포커스 링.

## 비고
- 디자이너 단기 ROI Top3(focus ring 버그·로그인 radius·max-w+밀도)는 각각 F1·F2·A1/A4에 포함.
- 공용 컴포넌트 전면 치환(YCButton 전부)은 위험·범위 큼 → 이번엔 카드(YCCard)·배지 중심으로 흡수, 버튼은 높이 정규화 수준(YAGNI).
