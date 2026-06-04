---
name: web-performance-orchestrator
description: 웹앱 실행 속도 최적화를 측정→적용→검증으로 오케스트레이션한다. web-performance-engineer가 영향도순(이미지>API>렌더>DB>JS)으로 실제 코드를 수정하고 design-qa-reviewer가 회귀를 검증하는 생성-검증 팀. "속도 개선", "느려요", "버벅임", "성능 튜닝", "성능 최적화", "번들 줄여줘", "이미지 최적화 적용", "select * 제거", "인덱스 추가", "Lighthouse 개선", "다시 실행", "성능 업데이트", "이전 결과 기반 개선" 요청 시 반드시 이 스킬을 사용하라. (주의: 품질 *리포트*를 만드는 app-evaluation·tech-audit과 다르다 — 이 스킬은 성능을 **측정하고 코드를 직접 고친다**.)
---

# 웹 성능 최적화 오케스트레이터

성능 병목을 **측정 → 영향도순 적용 → 회귀 검증**한다. 리포트만 내는 감사(app-evaluation/tech-audit)와 달리 **실제 코드를 수정**하는 것이 목적이다.

**실행 모드: 생성-검증(에이전트 팀)** — 작업자 `web-performance-engineer` + 검증자 `design-qa-reviewer`.

## Phase 0: 컨텍스트 확인

1. `_workspace/perf/` 존재 여부 확인.
   - 없음 → **초기 실행**
   - 있음 + 부분 수정 요청("이미지만 다시") → **부분 재실행**(해당 항목만)
   - 있음 + 새 측정 요청 → 기존을 `_workspace/perf_prev/`로 옮기고 **새 실행**
2. 대상 스택 확인(이 프로젝트: Next.js 16 App Router + Supabase + Tailwind v4).

## Phase 1: 측정 (감사)

`web-performance-engineer`가 `web-performance-optimization` 스킬의 "0단계: 측정"을 수행:
- `npm run build`로 라우트별 First Load JS
- 안티패턴 grep: `select('*')`, lazy 없는 `<img>`, `next/dynamic` 부재, 인덱스 부재, 폰트 preload 부재
- 산출 `_workspace/perf/01_audit.md`: 발견 항목을 **영향도(이미지30/API25/렌더20/DB15/JS10)로 우선순위화**.

## Phase 2: 적용

`web-performance-engineer`가 우선순위 높은 것부터 코드 수정:
- 이미지 lazy/next/image → API 컬럼 좁히기/limit → 인덱스 → 번들(미사용 제거·동적 import) → 폰트 preload.
- **각 항목 적용 직후** `npx tsc --noEmit` + `npm run build`로 회귀 자가검증.
- 위험·범위 밖(스키마 대수술, 이미지 호스팅 전환)은 적용하지 말고 백로그로 분리.
- 산출 `_workspace/perf/02_changes.md`: before/after 근거.

## Phase 3: 검증

`design-qa-reviewer`가 독립 검증:
- `npx tsc --noEmit` + `npm run build` 통과
- 기능 동치(컬럼 좁힌 쿼리의 소비처에 undefined 없음, 이미지 정상 표시)
- 규제 문구·토큰 무결성(이 프로젝트 고유 게이트) 유지
- 결함 발견 시 `web-performance-engineer`에 `SendMessage` 회신 → 수정 → 재검증.

## 데이터 전달 프로토콜

- **태스크 기반**(`TaskCreate`/`TaskUpdate`): 항목별 진행·의존.
- **파일 기반**(`_workspace/perf/`): 감사·변경 근거 보존(감사 추적).
- **메시지 기반**(`SendMessage`): 검증자↔작업자 결함 회신.
- 수동 인계(Supabase SQL Editor 인덱스 실행 등)는 별도 태스크 + 사용자 보고로 분리.

## 에러 핸들링

- 빌드/타입 실패: 해당 변경 되돌림 → 1회 재시도 → 재실패 시 그 항목 건너뛰고 보고서에 누락 명시.
- 측정 불가(빌드 자체 실패): 먼저 빌드를 살린 뒤 진행. 상충 데이터는 삭제하지 않고 출처 병기.

## 후속 작업 지원

- "성능 다시 점검", "이미지만 다시", "번들 더 줄여줘" 등 후속 트리거 → Phase 0에서 부분/전체 재실행 판별.
- 이전 `_workspace/perf/` 결과의 이미 적용 항목은 건너뛴다.

## 트리거 충돌 회피

- **이 스킬**: 성능 측정 + **코드 수정**("느려요", "속도 개선", "번들 줄여줘", "인덱스 추가").
- `app-evaluation-orchestrator`: 앱 전반 품질 **리포트**("앱 평가", "전체 점검").
- `tech-audit`: 코드 품질/보안 **감사 리포트**("코드 리뷰", "기술 감사").
- 겹치면 "측정만/리포트만"이면 audit, "고쳐줘/빠르게"면 이 스킬.

## 테스트 시나리오

**정상 흐름**: "앱이 느려요, 빠르게 해줘" → Phase 1 감사(이미지 lazy 없음·select * 다수 발견) → Phase 2 영향도순 적용(이미지→쿼리→인덱스→번들) → Phase 3 tsc/빌드/동치 검증 통과 → 변경 요약 + 수동 인계(인덱스 SQL) 보고.

**에러 흐름**: select 컬럼을 좁힌 뒤 빌드에서 소비처 타입 오류 → 누락 컬럼 복원 → 재빌드 통과 → 해당 쿼리는 "필요 컬럼 전체 유지"로 보고서에 기록.
