---
name: screen-reimplementation
description: 약사로케어 디자인 핸드오프(design_handoff_yaksaro_care)의 9개 화면을 기존 Next.js 라우트에 픽셀 가깝게 재구현한다. 데이터는 기존 Supabase/API를 보존하고 표현만 새 디자인으로 교체. "화면 재구현", "프로토타입 반영", "디자인 적용", "Landing/Home/Wallet/Today/OCR/Calendar/Share/Settings/AddMed 화면 구현", "애니메이션 연결", "UI 픽셀 맞추기" 작업 시 반드시 사용. screen-implementer 에이전트가 이 스킬을 사용한다.
---

# Screen Reimplementation — 핸드오프 화면 재구현

프로토타입 화면을 기존 라우트에 새 디자인으로 재구현한다. **핵심 계율: 데이터는 보존, 표현만 교체.** 프로토타입의 약품(아모잘탄정 등)은 데모 더미이므로 절대 코드에 넣지 않는다.

## 0. 선행 확인 (화면 착수마다)

1. `design_handoff_yaksaro_care/README.md`의 해당 화면 스펙 + "Animations" + "Regulatory Constraints"
2. 프로토타입 원본 jsx (screens.jsx / screens-extra.jsx / screens-settings-add.jsx)
3. `_workspace/ui/01_design-system_output.md` — 쓸 수 있는 토큰·컴포넌트
4. **재구현 대상 기존 라우트 파일을 먼저 읽어 데이터 흐름 파악** — 어떤 쿼리/Server Action/API가 어떤 shape을 주는지

## 1. 작업 순서 (화면 1개 단위)

1. 기존 라우트의 **데이터 레이어를 식별·보존** (서버 컴포넌트 쿼리, props, API 호출)
2. 표현 레이어를 README 스펙대로 재작성 — design-system 컴포넌트(YCCard/YCButton/...) + 토큰 사용
3. 해당 화면 애니메이션 연결 (전역 키프레임 클래스 부착)
4. 규제·실버 UX·터치타겟 자가 점검
5. `npx tsc --noEmit`
6. `_workspace/ui/02_screens_output.md`에 기록 → design-qa-reviewer에 검증 요청(점진적)

## 2. 화면 ↔ 라우트 매핑 + 수용 기준

경로는 착수 전 실제 확인(추정). 각 화면의 핵심 인터랙션은 README 해당 섹션이 권위.

| 화면 | 라우트(추정) | 보존할 데이터 | 핵심 디자인 포인트 |
|---|---|---|---|
| **Landing** | `app/page.tsx`·`landing-client.tsx` | 구글·카카오 OAuth | 스크롤 없는 한 화면, 헤드라인 40/33·900, 카카오 #FEE500·구글 흰버튼, 로그인 성공 풀스크린 오버레이(체크 pop→홈) |
| **Home** | `app/home/` | medication_schedules 슬롯 | 시간대 인사 26/900, 상태 알림 카드 3종(다음/지연/완료), 2×2 그리드. 슬롯 08:00/12:30/19:00 실시간 |
| **Wallet** | `app/wallet/` | user_medications + 처방전 그룹 | 끼니 퀵체크 3칸, 처방약 그룹 접기/펼치기 + 만료 배지, MedRow(약사진 자리 원형 아이콘·용법 blue·분류 배지·효능 토글·수정/삭제 인라인) |
| **Today** | `app/today/` | schedules + check_logs | 타임라인 노드(완료/다음/대기), 체크 pop, **전체완료 색종이 오버레이**, 지연 앰버 배너 |
| **OCR** | `app/medications/ocr/` | `/api/ocr` CLOVA→GPT | idle→scanning→result 3단계, 스캔 빔·4단계 진행 리스트, result에서 약품 제외/포함 토글 |
| **Calendar** | `app/calendar/` | `/api/calendar` | 월 네비·날짜 그리드·상태 점(완료/부분/미복용) |
| **Share** | `app/share/` | user_medications + doctor-view | 큰 글씨 약 목록 + 의사 뷰 전환 토글(읽기 전용 확대) |
| **Settings** | `app/settings/` | profiles + localStorage | 글씨 크기·알림 토글·계정. (인라인 토글 스위치는 인라인 스타일로 — 기존 수정 이력 존중) |
| **AddMed** | `app/medications/add/` | drugs/supplements 검색 | type→method→form 3단계 내부 슬라이드, depth 0→1→2, 폼 스테퍼(용량/1일횟수/총일수) |

## 3. 애니메이션 연결

- **화면 전환**: depth 맵(`landing0·home/wallet/today/calendar/share1·settings/addmed2·ocr3`). 깊이↑ `.anim-fwd`, 깊이↓ `.anim-back`, 같은 depth 탭 이동 `.anim-fade`. App Router에서는 화면 래퍼에 `key`로 리마운트 + 방향 클래스, 또는 `framer-motion`.
- **이벤트**: 로그인 성공 `.anim-pop`, OCR `.anim-scan`, 복약 체크 `.anim-check-pop`+`.anim-checked-flash`.
- **전체 복약 완료 색종이 = `canvas-confetti` 라이브러리 호출** (CSS 키프레임 아님). Today 화면 전체 완료 시 `canvas-confetti`를 트리거하고, 색은 design-system이 제공한 토큰 기반 색 상수(green600/lime300/blue500/warning)를 `colors` 옵션에 넘긴다 — 화면에 hex를 직접 박지 않는다.
- CSS 키프레임은 design-system이 전역 제공 — 여기선 클래스 부착만.

## 4. 규제 준수 (타협 불가)

렌더 텍스트에 **절대 금지**: 복용 중단·처방 변경·의료적 판단·"위험"·진단 표현. **허용**: "알려진 상호작용 정보가 있습니다", "약사와 상담해보세요", "복용 시 주의가 필요할 수 있습니다". MedRow 상호작용 경고는 안전 표현 + alert-triangle만.

## 5. 데이터 보존 패턴

- 서버 컴포넌트의 Supabase 쿼리를 **그대로 두고** 결과를 새 컴포넌트에 전달.
- 프로토타입에만 있고 실데이터에 없는 필드(약 사진 등) → 플레이스홀더(원형 아이콘), 더미 삽입 금지.
- 쿼리 형태가 새 UI와 안 맞으면 → 백엔드를 바꾸지 말고 표현 레이어에서 매핑, 부족하면 오케스트레이터 보고.

## 색은 토큰으로 (하드코딩 금지)

화면 코드에 hex(`#0E6E54` 등)나 구 Tailwind 색 유틸(`bg-blue-600`)을 직접 쓰지 않는다. design-system이 노출한 토큰/유틸(`bg-yc-green600`, `text-yc-neutral900`, CSS 변수)만 참조한다. 색이 필요한데 토큰이 없으면 임의 hex를 박지 말고 design-system-engineer에 토큰 추가를 요청한다. (canvas-confetti 색도 토큰 기반 상수 사용.)

## 흔한 실수

- 프로토타입 더미 약품명을 코드에 남김 → QA 차단 대상. 반드시 실데이터 연결.
- 구 블루(`blue-600`/`#2563eb`) 하드코딩 → 그린 토큰 참조로.
- confetti를 CSS로 직접 구현 → `canvas-confetti` 사용.
- reduced-motion 가드 추가 → 핸드오프 위반.
- 모바일 탭바/데스크탑 사이드바 한쪽만 맞춤 → 둘 다 검증.
- 한 화면에서 데이터 쿼리까지 갈아엎음 → 범위 밖. 표현만.
