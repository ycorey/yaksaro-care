---
name: design-system-build
description: 약사로케어 디자인 핸드오프(design_handoff_yaksaro_care)의 토큰·폰트·전역 애니메이션·공유 컴포넌트를 Next.js + Tailwind v4 + shadcn 코드베이스에 구축한다. "디자인 토큰 적용", "그린 토큰 마이그레이션", "Paperlogy 폰트", "YCCard/YCButton 만들기", "공유 컴포넌트", "키프레임 추가", "디자인 시스템 기반 구축" 작업 시 반드시 사용. design-system-engineer 에이전트가 이 스킬을 사용한다.
---

# Design System Build — 핸드오프 토큰·컴포넌트 구축

design handoff의 시각 기반을 코드로 옮긴다. **단일 진실 공급원은 `design_handoff_yaksaro_care/README.md`의 Design Tokens 섹션**이며, 이 스킬은 그것을 Tailwind v4 코드로 옮기는 절차다.

## 0. 선행 확인

- `design_handoff_yaksaro_care/README.md` (Design Tokens, Shared Components, Animations, Logo Mark)
- `design_handoff_yaksaro_care/design-tokens.jsx` (YC 객체 + 컴포넌트 원본)
- `src/app/globals.css` (현재 블루 기반 — 마이그레이션 대상)
- 현재 스택: **Tailwind v4** (`@import "tailwindcss"` + `@theme inline` CSS 설정. tailwind.config.js 없음). shadcn 컴포넌트는 `class-variance-authority`(cva) + `cn()`.

## 1. 토큰 마이그레이션 (`src/app/globals.css`)

기존 `:root`의 약사로 케어 블루 토큰 블록(`--yc-primary: #2563eb` 등)을 그린 팔레트로 교체한다. README의 정확한 hex를 CSS 변수로 정의하고 `@theme inline`에 매핑해 `bg-yc-green600` 같은 유틸리티로 노출한다.

핵심 토큰(README Colors 그대로):
```
green600 #0E6E54 (주 브랜드·버튼·활성탭) · green700 #084B3A (그라데이션 끝·강조)
green50 #E3F2EB (브랜드/영양제 카드 배경) · green100 #C8E6D5 (보더/스피너 트랙)
lime300 #D9F25C (배지·색종이 액센트)
blue500 #4A8FCC (처방약 아이콘) · warning #E8A817 · error #C9423F
neutral900 #13261F (주 텍스트) … neutral50 #FAFAF5 (카드 옅은 배경) — 웜 그린틴트 10단계
pageBg #EFEBE2 (이미 일치 — 유지)
warningBg #FEF9E7 · errorBg #FEF2F2 · infoBg #EFF6FF · successBg #E3F2EB
```

원칙:
- **페이지 배경 `#EFEBE2`는 이미 맞다.** 건드리지 않는다.
- neutral 스케일은 회색이 아니라 **웜 그린틴트**다. 기존 `--yc-secondary` 등 순회색을 README neutral로 교체.
- radius: sm8/md12/lg16/xl22/full. shadow: README의 green-tinted 3단계(`rgba(19,38,31,...)`).
- 기존 shadcn 의존 변수(`--primary`, `--card` 등 oklch)는 **삭제하지 말 것** — shadcn 컴포넌트가 참조한다. YC 토큰은 별도 레이어로 추가.

## 2. 타이포그래피

- **Body**: Pretendard (이미 `--font-sans`에 설정됨) 유지.
- **Display/Heading**: **Paperlogy ExtraBold(weight 800)** 를 디스플레이 기본으로. `@font-face`로 `public/fonts/Paperlogy-ExtraBold.woff2`를 `font-weight: 800`로 등록 + `--font-display` 변수 + `.font-display` 유틸. 헤딩·타이틀·버튼·배지·탭 라벨에 적용. (랜딩 헤드라인 40·33은 더 굵게 900까지 쓰고 싶으면 별도 weight 파일 추가 가능하나, 기본·단일 weight는 ExtraBold 800.)
- **폰트 파일 부재 대응**: woff2가 없으면 `@font-face`는 두되 fallback이 Pretendard로 내려가게 하고, 사용자에게 "`public/fonts/Paperlogy-ExtraBold.woff2` 배치 필요"를 보고. 레이아웃은 폰트 없이도 정상이어야 한다.
- letter-spacing: 랜딩 헤드라인 -0.03em, 워드마크 -0.02em.

## 3. 전역 애니메이션 키프레임 (`globals.css`)

README "Animations" 표를 그대로 CSS keyframe + 유틸 클래스로. 정확한 스펙:

| 클래스 | keyframe | 스펙 |
|---|---|---|
| `.anim-fwd` | slide-fwd | `translateX(28px)→0` + opacity 0→1, 320ms `cubic-bezier(0.32,0.72,0,1)` |
| `.anim-back` | slide-back | `translateX(-28px)→0` + opacity, 320ms 동일 ease |
| `.anim-fade` | fade-screen | `translateY(6px)→0` + opacity, 260ms ease |
| `.anim-pop` | pop | `scale(0.3→1.08→1)`, 480ms `cubic-bezier(0.34,1.56,0.64,1)` |
| `.anim-spin` | spin | `rotate 360deg`, 0.7s linear infinite |
| `.anim-scan` | scan | `top 8%↔88%`, 1.6s ease-in-out infinite |
| `.anim-check-pop` | check-pop | `scale(1→1.9→1)`, 600ms |
| `.anim-checked-flash` | checked-flash | `scale(0.92→1)` + opacity, 360ms |

- **confetti(전체 복약 완료)는 CSS 키프레임으로 만들지 않는다 — `canvas-confetti` 라이브러리 사용.** 색은 토큰값(green600 `#0E6E54`·lime300 `#D9F25C`·blue500 `#4A8FCC`·warning `#E8A817`)을 JS 상수로 canvas-confetti `colors` 옵션에 전달. 이 색 상수는 디자인 토큰을 단일 출처로 참조하도록 `src/lib/`에 작은 헬퍼(예: `confettiColors`)로 둔다. → Today 화면 구현 시 screen-implementer가 호출.
- `canvas-confetti` 미설치 시 설치 필요(+ `@types/canvas-confetti`)를 오케스트레이터/사용자에 보고한 뒤 설치. 임의 설치 전 확인.
- 기존 `pmPulse/pmFloat` 등은 유지(다른 곳에서 사용). 새 키프레임은 추가만.
- `prefers-reduced-motion` 가드 **적용하지 않음** (핸드오프 지침 — 전환이 핵심 디자인).

## 4. 공유 컴포넌트 (`src/components/yc/`)

기존 shadcn `src/components/ui/`와 충돌 피하려 **YC 프리픽스 + 별도 디렉토리**. cva + cn 패턴으로 작성, props는 design-tokens.jsx 시그니처를 TypeScript로 옮긴다.

| 컴포넌트 | variant / 스펙 (README Shared Components) |
|---|---|
| `LogoMark` | 지그재그 100×100 `M 22 22 L 78 22 L 78 50 L 22 50 L 22 78 L 78 78` stroke 18 round. 배지형: green600 라운드사각(radius=size*0.22) + off-white 스트로크 + lime300 점선(strokeWidth 3.5, dasharray "6 4") |
| `LogoWordmark` | "약사**로**케어" — '로'만 green600, 나머지 neutral900, 700, ls -0.02em. **기존 `public/brand-assets/logo-wordmark.svg`와 일관 유지** |
| `TabBar` | 하단 5탭 고정. 활성 green600+700, 비활성 neutral400. 높이 64, 상단 1px neutral200, 흰 배경 |
| `YCCard` | `default`(흰배경/neutral200 보더/shadowSm) · `brand`(green50/#89CCB3 보더) · `dark`(green600). radius md |
| `YCButton` | `primary`(green600/흰) · `secondary`(green50/green600) · `outline`(흰/neutral200) · `ghost`. size sm36/md44/lg52. Paperlogy 700 |
| `YCBadge` | default/brand/lime/warning/error/info. radius sm, 12px 600 |
| `SectionHeader` | 점 마커(컬러 원) + 라벨 + (n종) 카운트 |

- 아이콘은 프로토타입의 인라인 SVG 대신 **`lucide-react`** 사용(README 권장). 이미 의존성에 있으면 재사용, 없으면 오케스트레이터에 설치 필요 보고.
- 기존 화면이 쓰는 `AppHeader`(로고 헤더)와 LogoWordmark가 중복되지 않게 조율 — AppHeader가 LogoWordmark를 쓰도록 통합 권장.

## 5. 완료 기준

- `npx tsc --noEmit` 통과.
- `_workspace/ui/01_design-system_output.md`에 [토큰 이름 표 · 컴포넌트 경로/props · 폰트 상태] 기록.
- 각 단계(토큰→키프레임→컴포넌트) 완료 시 screen-implementer에 사용 가능 통지.

## 흔한 실수

- shadcn oklch 변수 삭제 → 기존 UI 깨짐. **추가만 하고 삭제 금지.**
- neutral을 순회색(gray-500)으로 → 웜톤 상실. README hex 그대로.
- 페이지 배경 변경 → 이미 맞으므로 불필요.
- 키프레임에 reduced-motion 가드 추가 → 핸드오프 위반.
