# Handoff: 약사로케어 (Yaksaro Care) — 디지털 약 지갑 모바일 앱

## Overview
약사로케어는 **"디지털 약 지갑"** 모바일 앱입니다. 사용자가 자신이 복용 중인 모든 약(처방약·일반약·영양제)을 한 곳에 모아두고, 복약을 체크하고, 병원·약국 방문 시 한 화면으로 보여줄 수 있게 합니다.

핵심 포지셔닝: *AI 약물 분석 서비스가 아니라*, 약국과 환자를 연결하는 **디지털 약 지갑**입니다. 메인 카피는 "내 약을 한 곳에 담아두는 디지털 약 지갑".

이 핸드오프는 디자인 탐색 과정에서 만든 **고충실도(hi-fi) 프로토타입 9개 화면 + 전환/이벤트 애니메이션**을 담고 있습니다.

---

## About the Design Files
이 번들의 파일들은 **HTML/React(인라인 Babel JSX)로 만든 디자인 레퍼런스**입니다 — 의도한 외관과 동작을 보여주는 프로토타입이지, 그대로 복사해 출시할 프로덕션 코드가 아닙니다.

작업 목표는 이 디자인을 **실제 코드베이스(`yaksaro-care` — Next.js + TypeScript + Tailwind + shadcn/ui + Supabase)의 기존 패턴과 컴포넌트로 재구현**하는 것입니다. 실제 레포에는 이미 다수의 화면이 구현되어 있으므로, 이 프로토타입은 **시각 디자인·인터랙션·애니메이션의 기준**으로 삼고, 데이터 연동은 기존 Supabase/API 레이어를 사용하세요.

> 참고: 프로토타입의 약품 데이터(아모잘탄정, 리피토정 등)는 데모용 더미입니다. 실제 구현은 기존 OCR(CLOVA) → GPT 정제 파이프라인과 DB를 사용합니다.

---

## Fidelity
**High-fidelity (hi-fi)**. 최종 컬러·타이포그래피·간격·인터랙션·애니메이션이 모두 확정된 픽셀 단위 목업입니다. 개발자는 코드베이스의 기존 라이브러리(Tailwind/shadcn)로 이 UI를 **픽셀에 가깝게 재현**해야 합니다. 단, 색상·폰트·간격 토큰은 아래 Design Tokens 섹션의 정확한 값을 사용하세요.

---

## Tech Stack (target codebase)
- **Framework**: Next.js (App Router) + React + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Icons**: 프로토타입은 Lucide 아이콘을 인라인 SVG로 사용 — 실제 코드는 `lucide-react` 사용 권장
- **Fonts**: Paperlogy (디스플레이/헤딩), Pretendard (본문)
- **Backend**: Supabase (auth, DB), OCR = CLOVA → GPT 정제

---

## Global Layout & Navigation

### App Shell
- 모바일 세로 화면. 프로토타입 캔버스는 **380×820 (Android)** / **375×812 (iPhone)** 기준.
- 하단 고정 **탭바**(높이 64px)가 5개 탭 화면에서 노출됨: 홈 / 약지갑 / 오늘복약 / 캘린더 / 전달.
- 랜딩·OCR·설정·약추가 화면은 탭바 없음(풀스크린 플로우).
- 모든 화면 상단에 **약사로케어 로고 헤더** (로고 마크 24px + 워드마크). 로고 클릭 시 랜딩으로 복귀.

### 화면 깊이(Depth) & 전환 애니메이션
화면 전환은 **방향성 슬라이드/페이드**로 처리:
- Depth 맵: `landing:0, home:1, wallet:1, today:1, calendar:1, share:1, settings:2, addmed:2, ocr:3`
- **더 깊이 진입**(depth 증가) → 오른쪽에서 슬라이드 인 (`translateX(28px)→0`, opacity 0→1, 320ms `cubic-bezier(0.32,0.72,0,1)`)
- **뒤로 나옴**(depth 감소) → 왼쪽에서 슬라이드 (`translateX(-28px)→0`, 320ms)
- **탭끼리 이동**(같은 depth, 탭바 화면 간) → 크로스페이드 (`translateY(6px)→0`, opacity, 260ms ease)
- 같은 패턴을 **약 추가 플로우 내부 단계 전환**(타입→방법→폼)에도 적용.
- 구현 팁: 화면 래퍼에 `key={screenId}` 를 주어 리마운트시키고, 방향 클래스(`anim-fwd`/`anim-back`/`anim-fade`)를 붙여 CSS keyframe을 재실행.
- ⚠️ `prefers-reduced-motion` 가드는 **의도적으로 적용하지 않음** (전환이 핵심 디자인 요소). 접근성이 필요하면 별도 협의.

---

## Design Tokens

### Colors
```
/* Primary (브랜드 그린) */
green600   #0E6E54   // 주 브랜드 컬러 (버튼, 강조, 활성 탭)
green700   #084B3A   // 그라데이션 어두운 끝, 강조 텍스트
green50    #E3F2EB   // 연한 배경 (브랜드 카드, 영양제 카드)
green100   #C8E6D5   // 보더/스피너 트랙
lime300    #D9F25C   // 액센트 (배지, 색종이)

/* Secondary */
blue500    #4A8FCC   // 처방약 관련 아이콘/텍스트
warning    #E8A817   // 주의/지연 상태 (앰버)
error      #C9423F   // 삭제/오류

/* Neutrals (웜 그린틴트) */
neutral900 #13261F   // 주 텍스트 (다크 잉크)
neutral800 #1E3A2F
neutral700 #2D4A3E
neutral600 #3D4A44
neutral500 #5A6B62   // 보조 텍스트
neutral400 #8A9890   // 캡션/플레이스홀더
neutral300 #C8CBC3   // 보더(진한)
neutral200 #E2E4DE   // 보더(기본)
neutral100 #F0F1EC   // 구분선/스켈레톤
neutral50  #FAFAF5   // 카드 내 옅은 배경

/* Page background (웜 베이지 — 사용자 선호 유지) */
pageBg     #EFEBE2

/* Semantic backgrounds */
warningBg  #FEF9E7    (텍스트 #92600A / #7A5A00)
errorBg    #FEF2F2
infoBg     #EFF6FF    (처방약 아이콘 배경; 텍스트 #1E5BA8)
successBg  #E3F2EB
```

### Typography
- **Display/Heading**: `Paperlogy` (weights 100–900). 헤드라인·타이틀·버튼·배지·탭 라벨에 사용.
- **Body**: `Pretendard Variable` (fallback `Pretendard`). 본문·설명문에 사용.
- 주요 크기 (px):
  - 랜딩 헤드라인 1행 40 / 2행 33, weight 900, letter-spacing -0.03em, line-height 1.15~1.2
  - 화면 타이틀(h1) 22, weight 800
  - 카드 타이틀 15–17, weight 800
  - 본문 13–16, weight 400–600
  - 캡션 11–12, weight 400–600
  - 배지 11–12, weight 600
  - 탭 라벨 10, weight 500/700
- **최소 폰트 규칙**(제품 원칙): 본문 최소 18px 지향, 핵심 정보 24px+. (프로토타입은 0.75 스케일로 표시되어 실수치는 더 큼.)

### Spacing / Radius / Shadow
```
radius:  sm 8 · md 12 · lg 16 · xl 22 · full 9999
shadowSm:  0 1px 2px rgba(19,38,31,.06), 0 1px 3px rgba(19,38,31,.10)
shadowMd:  0 4px 6px rgba(19,38,31,.07), 0 2px 4px rgba(19,38,31,.06)
shadowLg:  0 10px 15px rgba(19,38,31,.10), 0 4px 6px rgba(19,38,31,.05)
공통 화면 좌우 패딩: 20px
카드 패딩: 12–20px
터치 타겟 최소: 44px (제품 원칙)
ease(전환): cubic-bezier(0.4,0,0.2,1) / 슬라이드 cubic-bezier(0.32,0.72,0,1)
```

### Logo Mark
지그재그 마크 — 100×100 viewBox, 경로:
`M 22 22 L 78 22 L 78 50 L 22 50 L 22 78 L 78 78` (stroke 18, round cap/join).
배지 변형: green600 라운드 사각형(radius=size*0.22) 안에 off-white(#FAFAF5) 스트로크 마크 + lime300 점선 오버레이(strokeWidth 3.5, dasharray "6 4").
워드마크: "약사**로**케어" — '로'만 green600, 나머지 neutral900, Paperlogy 700, letter-spacing -0.02em.

---

## Shared Components (design-tokens.jsx 참조)
- **LucideIcon** — Lucide 아이콘 인라인 SVG 래퍼. 실제 구현은 `lucide-react`로 대체.
- **LogoMark / LogoWordmark** — 위 Logo Mark 스펙.
- **TabBar** — 하단 5탭 고정 네비. 활성 탭은 green600 + weight 700; 비활성 neutral400. 높이 64, 상단 1px neutral200 보더, 흰 배경.
- **YCCard** — variant: `default`(흰 배경, neutral200 보더, shadowSm) / `brand`(green50 배경, #89CCB3 보더) / `dark`(green600 배경). radius md.
- **YCButton** — variant: `primary`(green600/흰글씨) / `secondary`(green50/green600) / `outline`(흰배경/neutral200 보더) / `ghost`. size sm(36)/md(44)/lg(52). Paperlogy 700.
- **YCBadge** — variant: default/brand/lime/warning/error/info. radius sm, 12px 600.
- **SectionHeader** — 점 마커(컬러 원) + 라벨 + (n종) 카운트.

---

## Screens / Views (9개)

### 1. Landing (랜딩 / 로그인) — `LandingScreen`
- **Purpose**: 첫 진입·소셜 로그인. **스크롤 없이 한 화면**에 모두 들어가도록 설계.
- **Layout**: 세로 flex, 좌우 패딩 20. 위→아래: 로고 헤더 → 히어로 카피 → CTA 2버튼 → 주의사항 1줄 → "이렇게 정리됩니다" 프리뷰 카드 3개(컴팩트 row) → (하단 여백).
- **Copy**:
  - 상단 질문: "병원 갈 때 무슨 약 먹는지 기억나시나요?" (18px, weight 600, color neutral900=검정)
  - 헤드라인: "이제 드시는 약," (40px) / "3초 만에 보여주세요." (33px), weight 900
  - 서브: "한 곳에 담아두는 디지털 약 지갑, **약사로케어**" (한 줄, nowrap; '약사로케어' 18px 800, '로'는 green600)
- **CTA 버튼**:
  - 카카오: 배경 `#FEE500`, 글씨 `#191919`, 카카오 말풍선 SVG, 16px 700.
  - 구글: 흰 배경 + neutral200 보더 + shadowSm, 구글 4색 G 로고 SVG.
- **주의사항** (구글 버튼 바로 아래): shield 아이콘 + "민감 개인정보는 즉시 비식별화 후 파기 · 복약 기록·참고 서비스이며 의학적 판단을 대체하지 않습니다." (11px neutral400).
- **프리뷰 카드 3개**(아이콘 36px 사각 + 제목 + 설명 + 우측 배지): 서울내과 처방약(store 아이콘, 5종), 상시 영양제(leaf, brand variant, 4종), 약국 일반약(pill).
- **Interaction — 소셜 로그인 애니메이션**:
  1. 버튼 탭 → 해당 버튼에 **스피너 + "로그인 중..."**, 반대 버튼 opacity 0.45.
  2. ~1100ms 후 → **풀스크린 성공 오버레이**(green600→green700 그라데이션): 흰 원 안 체크마크가 pop 애니메이션(scale 0.3→1.08→1, 480ms), "로그인 완료" + "내 약 지갑을 불러오는 중...".
  3. ~1900ms(총) 후 → 홈으로 네비게이트.

### 2. Home (홈) — `HomeScreen`
- **Purpose**: 대시보드. 다음 복약/지연/완료 상태 + 4개 바로가기.
- **Layout**: 로고+설정 헤더 → 날짜/인사 → **상태 알림 카드** → "무엇을 도와드릴까요" 2×2 그리드.
- **인사**: 시간대별("좋은 아침이에요/오후에요/저녁이에요"), 26px 900. 날짜 "M월 D일 요일".
- **상태 알림 카드**(라운드 lg, 패딩 20, 탭 시 오늘복약으로 이동) — 3가지 상태:
  - **다음 복약**(그린 그라데이션): "다음 복약 시간" + "{끼니} 약 · {N시간 M분} 후" + 진행바(green) + "오늘 3번 중 N번 챙김".
  - **지연**(앰버 그라데이션 #C77A12→#9A5A06, 그림자 앰버): "잊지 않으셨죠?" + "{끼니} 약 드실 시간이에요" + "{HH:MM} · {N분/시간} 지났어요" + 앰버 진행바. (해당 슬롯 시간 +30분 경과 시)
  - **완료**(그린): "오늘 복약 완료" + "모두 챙기셨어요 ✓" + "오늘의 3번 복약을 모두 완료했습니다".
  - 슬롯 기준: 아침 08:00 / 점심 12:30 / 저녁 19:00. 현재 시각 기준 실시간 계산.
- **2×2 그리드 카드**: 아이콘(40px 라운드 배경) + 제목 + 설명 + (선택)스탯.
  - 내 약지갑(wallet, blue, "약 8종") / 오늘 복약(heart, green, "N/3 챙김") / 복약 캘린더(calendar, 앰버) / 의사·약사 보여주기(send, green).

### 3. Wallet (내 약지갑) — `WalletScreen`
- **Purpose**: 약을 카테고리별로 보관·열람·편집.
- **Layout**: 로고+설정+추가 헤더 → "내 약지갑/종류별로 나눠서 한눈에" → 끼니 퀵 체크 3칸 → 처방약·일반약 섹션 → 영양제·보조제 섹션.
- **헤더 우측**: 설정 아이콘 버튼(40px, neutral100) + "추가" 버튼(YCButton sm, plus 아이콘 → addmed 이동).
- **끼니 퀵 체크**: 아침/점심/저녁 3칸, 완료 시 green50 배경+#89CCB3 보더+체크, 시간 표기.
- **처방약 그룹 카드**(접기/펼치기): 헤더에 store 아이콘 + 병원명 + "날짜 · N종" + 만료 배지(info, "6월 11일 · D-8") + chevron(펼치면 90° 회전). 펼치면 **MedRow** 목록.
- **MedRow** (개별 약, 핵심 컴포넌트):
  - 좌측 44px 원형 아이콘(infoBg + pill blue) — 실제 구현 시 약 사진 들어갈 자리.
  - 약 이름(16px 700) + (성분명)(neutral400) + 제조사(12px) + 용법(13px 600 blue: "1회 1정 · 1일 1회 · 14일분").
  - **분류 배지**: 카테고리(info, 예: 고혈압약) + 분류(default, 예: 전문의약품).
  - 상호작용 경고 있으면: alert-triangle + "알려진 상호작용 정보가 있습니다"(#92600A). ⚠️ 규제 준수 — 절대 복용 중단/처방 변경 권고 금지.
  - **"이 약은 어떤 약인가요?" 토글**(info 아이콘, blue): 펼치면 infoBg 박스에 효능·효과 / 복용법 / 주의사항(각 13px, 라벨 볼드).
  - **수정/삭제** 인라인: '수정' → 1회량/1일횟수/총일수 인풋 + 저장(blue)/취소. '삭제' → "삭제할까요? 예,삭제(error)/아니오" 확인 → 삭제됨(되돌리기 제공).
- **약국 일반약 카드**: pill 칩 목록(타이레놀/훼스탈/판콜에이).
- **영양제·보조제 섹션**: brand variant 카드 행들(leaf 아이콘 + 이름 + 제조사).

### 4. Today (오늘 복약) — `TodayScreen`
- **Purpose**: 시간대별 복약 체크 + 완료 축하.
- **Layout**: 로고 헤더 → "오늘 복약" → (지연 시)앰버 배너 → "오늘 N/3 챙김" → **타임라인 카드**.
- **지연 배너**(슬롯+30분 경과): warningBg, "{끼니} 약 드실 시간이 지났어요" + 시간 + "지금 먹기" 버튼.
- **타임라인**: 슬롯별 행 — 좌측 시간/끼니, 가운데 노드 점(완료=green600 채움, 다음=흰+green 보더+green50 글로우, 대기=neutral200), 우측 "약 8개" + 액션.
  - 다음 슬롯 행: 좌측 4px green600 보더 + green50 옅은 배경 강조.
  - 완료된 행: opacity 0.55, "{시각} 복용 · 되돌리기" 텍스트 버튼.
  - 대기 행: "지금 먹기" 버튼(다음=primary, 그 외=outline), 최소 44px.
- **Interaction — 체크 애니메이션**:
  - "지금 먹기" 탭 → 노드 점 **pop**(scale 1→1.9→1, 600ms), 행에 "쪼아요! 복용 완료" 플래시(360ms) 후 "{시각} 복용 · 되돌리기"로 정착.
  - **전체 완료 시 → 색종이 축하 오버레이**: 반투명 흰 배경(blur), 색종이 16개가 위에서 낙하(green/lime/blue/warning 색, 각기 다른 delay/duration, translateY 560px + rotate 540°), green 원(104px) 안 체크마크 pop, "오늘 복약 끝!" + "세 번 모두 잘 챙기셨어요 👏". ~2800ms 후 자동 닫힘(탭 시 즉시).
- 하단 면책: "이 앱은 복약 정보 기록·참고 서비스입니다. 의학적 진단·처방을 대체하지 않습니다."

### 5. OCR (처방전 촬영) — `OcrScreen`
- **Purpose**: 처방전 사진에서 약품 추출 → 확인 → 약지갑 저장.
- **3 phase**: idle → scanning → result.
- **idle**: 점선 보더 업로드 영역(camera 아이콘) + "카메라 촬영"(primary) / "사진 선택"(outline) 버튼.
- **scanning — 애니메이션**:
  - 흰 문서 목업(가짜 처방전 라인들) 위로 **그린 스캔 빔**이 위아래로 이동(`top 8%↔88%`, 1.6s ease-in-out 무한), 네 모서리 green 인식 브래킷.
  - "처방전을 안전하게 읽어오고 있습니다" 타이틀.
  - **4단계 진행 리스트**(각 850ms 순차): 처방전 이미지 인식 → 글자 읽어오는 중(OCR) → AI로 약품명 정제 → 개인정보 비식별화. 각 단계: 완료=green 원+흰 체크, 진행중=흰 원+green 보더+스피너, 대기=neutral100+회색 아이콘. 진행중 행은 green50 배경.
  - 마지막 단계 후 ~650ms → result로 자동 전환(데모 버튼 없음).
  - 개인정보 안내: "민감한 개인정보는 읽어오는 즉시 비식별화 후 파기됩니다".
- **result**: "읽어온 처방전이 맞으신가요?" + 재촬영 버튼 → 발행 병원 카드 → 추출 약품 목록(EDI 코드/이름/성분/용법/배지) 각 항목 **제외/포함 토글** → 하단 sticky "확인 완료 — 내 약 지갑에 저장하기 (N종)" → 저장 시 wallet 이동.

### 6. Calendar (복약 캘린더) — `CalendarScreen` (screens-extra.jsx)
- **Purpose**: 날짜별 복약 기록 열람.
- 월 네비(년/월 이동), 요일 헤더, 날짜 그리드 — 각 날짜에 복약 상태 점(완료/부분/미복용). 날짜 선택 시 해당일 상세.

### 7. Share (의사·약사 보여주기) — `ShareScreen` (screens-extra.jsx)
- **Purpose**: 진료·조제 시 현재 복용 약을 한 화면으로 제시.
- "의사·약사님께 보여주기" + "현재 복용 중인 약 목록을 보여주세요" → 큰 글씨 약 목록(처방약/영양제 그룹) → **의사 뷰(showDoctorView)** 전환 토글(더 크고 단순한 읽기 전용 뷰).

### 8. Settings (설정) — `SettingsScreen` (screens-settings-add.jsx)
- 글씨 크기(normal 등), 복약 알람 on/off, 계정/로그아웃, 개인정보·약관 등 토글·리스트 항목.

### 9. Add Medication (약 추가) — `AddMedScreen` (screens-settings-add.jsx)
- **3단계 플로우** (내부 슬라이드 전환): 
  - `type`: "어떤 약을 추가할까요?" → 처방약·일반약 / 영양제·보조제 2카드.
  - `rxMethod`: 건강기록 불러오기(추천 배지) / 약봉투 촬영(→OCR) / 처방전 QR(→OCR).
  - `suppMethod`: 바코드·설명서 촬영 / 직접 입력.
  - `form`: 탭(처방의약품/약국일반약/영양제) + 검색 + 용량/1일횟수/총일수 입력.
- 뒤로 화살표는 이전 단계로(슬라이드 back). depth: type 0 → method 1 → form 2.

---

## State Management (요약)
- **전역(App)**: `screen`(현재 화면 id), `history`, `anim`(전환 방향). 실제 구현은 Next.js 라우팅(App Router)으로 대체 — 각 화면 = 라우트, 전환 애니메이션은 `framer-motion` 또는 CSS로.
- **LandingScreen**: `login = { provider, phase }` (null/loading/success).
- **HomeScreen**: 슬롯 완료 상태(데모는 아침만 완료) — 실제는 DB 조회. 현재 시각 기반 다음/지연/완료 계산.
- **WalletScreen**: `expandedRx`(펼친 처방전 id). **MedRow**: `open`(효능 토글), `mode`(view/edit/confirmDelete/deleted).
- **TodayScreen**: `slots[]`(체크 상태), `justChecked`(방금 체크한 끼니 — 플래시용), `celebrate`(축하 오버레이).
- **OcrScreen**: `phase`(idle/scanning/result), `scanStep`(0–3), `excluded`(제외한 약 Set).
- **AddMedScreen**: `step`, `stepAnim`(fwd/back), `formTab`, `searchQuery`, `doseAmount`, `dosesPerDay`, `totalDays`.

---

## Animations (정리)
| 이름 | 용도 | 스펙 |
|---|---|---|
| slide-fwd / slide-back | 화면·단계 전환 | translateX ±28px→0 + opacity, 320ms cubic-bezier(0.32,0.72,0,1) |
| fade-screen | 탭 간 전환 | translateY 6px→0 + opacity, 260ms ease |
| pop | 로그인 성공/완료 배지 | scale 0.3→1.08→1, ~480ms cubic-bezier(0.34,1.56,0.64,1) |
| spin | 로딩 스피너 | rotate 360°, 0.7s linear infinite |
| scan | OCR 스캔 빔 | top 8%↔88%, 1.6s ease-in-out infinite |
| check-pop | 복약 체크 노드 | scale 1→1.9→1, 600ms |
| checked-flash | 복약 완료 텍스트 | scale 0.92→1 + opacity, 360ms |
| confetti | 전체 복약 완료 | translateY 0→560px + rotate 540°, 1.7–2.75s, 색상 4종 |

---

## Regulatory Constraints (반드시 준수)
- **절대 금지**: 복용 중단 권고, 처방 변경 권고, 의료적 판단.
- **안전한 표현만**: "알려진 상호작용 정보가 있습니다", "약사와 상담해보세요", "복용 시 주의가 필요할 수 있습니다".
- 서비스 정의: 의료기기 ❌ / 복약 관리 도구 ✅ / 약사 상담 보조 도구 ✅.
- 마케팅 카피는 기능 중심(AI 분석/위험도)이 아니라 문제 해결 중심으로.

---

## Assets
- **로고**: 코드 내 인라인 SVG(지그재그 마크). 별도 파일 불필요 — 위 Logo Mark 스펙으로 재현하거나 레포의 기존 SVG 사용.
- **아이콘**: Lucide (`home, wallet, heart, calendar, send, camera, image, plus, check, chevron-right/left, x, settings, pill, leaf, scan, clock, alert-triangle, shield, user, file-text, store, phone, sparkles, info`). → `lucide-react`로 매핑.
- **소셜 로고**: 카카오 말풍선/구글 G — 인라인 SVG(약사로케어 프로토타입.html 랜딩 참조).
- **폰트**: Paperlogy(.ttf, 100–900) — 프로토타입은 `../fonts/`에서 로드. Pretendard는 CDN(jsdelivr). 실제 레포의 폰트 설정 사용.
- 이미지·실제 약 사진은 없음(원형 아이콘 플레이스홀더).

---

## Files (이 번들)
| 파일 | 내용 |
|---|---|
| `약사로케어 프로토타입.html` | 메인 엔트리 — App 컴포넌트, 화면 전환 로직, 전역 `<style>`(모든 keyframe), 폰트/스크립트 로드. 브라우저로 바로 열어 동작 확인 가능. |
| `design-tokens.jsx` | 토큰(YC) + 공통 컴포넌트(LucideIcon, LogoMark, LogoWordmark, TabBar, YCCard, YCButton, YCBadge, SectionHeader). |
| `screens.jsx` | LandingScreen, HomeScreen, WalletScreen(+MedRow), TodayScreen, OcrScreen. |
| `screens-extra.jsx` | CalendarScreen, ShareScreen. |
| `screens-settings-add.jsx` | SettingsScreen, AddMedScreen. |
| `ios-frame.jsx` / `android-frame.jsx` | 디바이스 베젤(프로토타입 표시용). 실제 앱엔 불필요. |
| `tweaks-panel.jsx` | 디자인 검토용 트윅 패널(컬러/배경/화면 전환). 실제 앱엔 불필요. |

### 동작 확인 방법
`약사로케어 프로토타입.html`을 브라우저로 열면 모든 화면·애니메이션을 클릭으로 체험할 수 있습니다. (인라인 Babel이라 별도 빌드 불필요. 단, 폰트 ttf 경로는 프로토타입 환경 기준이므로 폰트가 안 보여도 레이아웃은 정상.)
