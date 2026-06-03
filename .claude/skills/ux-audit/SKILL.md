---
name: ux-audit
description: 약사로 케어 앱의 UX/UI를 평가하는 스킬. 실버세대 접근성, 모바일 최적화, 네비게이션 흐름, 시각적 일관성, V2 프로토타입 갭을 분석한다. "UX 평가", "UI 점검", "접근성 감사", "화면 개선점", "실버세대 UX", "디자인 리뷰" 요청 시 반드시 이 스킬을 사용하라.
---

# UX/UI 감사 스킬

## 평가 순서

### 1. 파일 수집
다음 경로를 순서대로 읽는다:
- `src/app/home/home-client.tsx` — 홈 화면
- `src/app/wallet/page.tsx` — 약지갑
- `src/app/wallet/prescription-section.tsx`
- `src/app/wallet/supplement-section.tsx`
- `src/app/wallet/otc-section.tsx`
- `src/app/today/today-timeline.tsx` — 복약 타임라인
- `src/app/calendar/page.tsx` — 캘린더
- `src/app/share/share-client.tsx` — 전달
- `src/app/medications/ocr/ocr-uploader.tsx` — OCR
- `src/components/dashboard/nav.tsx` — 네비게이션

### 2. 평가 기준표

#### 실버세대 기준 (60세+ 타겟)
| 항목 | 최소 기준 | 확인 방법 |
|------|---------|---------|
| 본문 폰트 | 16px 이상 | text-base 이상 클래스 |
| 핵심 정보 | 20px 이상 | text-xl 이상 |
| 터치 타겟 | 48px 이상 | h-12 이상 또는 py-3 이상 버튼 |
| 색상 대비 | 4.5:1 이상 | 회색계열 text-gray-400 이하는 위험 |
| 오류 메시지 | 구체적 안내 | "오류" 단독 사용 금지 |

#### 네비게이션
- 현재 위치 명확성 (활성 탭 표시)
- 약 추가 진입 경로 (헤더 + 버튼 두 곳 이상)
- 뒤로가기 없을 때 탈출구

#### 일관성
- 배경색: 모든 레이아웃이 `bg-[#EFEBE2]` 사용하는지
- 카드: `bg-white rounded-2xl` 패턴 일관성
- CTA 버튼: 딥그린 `#15604E` vs 파란색 혼용

### 3. 심각도 분류
- **Critical**: 사용 불가 수준 (타겟 사용자가 기능을 찾지 못함)
- **High**: 심각한 불편 (재시도 필요, 오해 발생)
- **Medium**: 개선 권장 (경험 저하)
- **Low**: 폴리싱 (완성도 향상)

### 4. 출력
`_workspace/eval/01_ux-audit.md`에 저장.
총평 → Critical → High → Medium → Low → 잘 된 점 → V2 갭 순서로 작성.
