---
name: ui-ux-implementation-orchestrator
description: 약사로케어 디자인 핸드오프(design_handoff_yaksaro_care) 기반 UI/UX 구현 하네스 오케스트레이터. design-system-engineer·screen-implementer·design-qa-reviewer 3개 에이전트를 에이전트 팀으로 협업시켜 토큰·폰트·공유 컴포넌트·9개 화면을 새 그린 디자인으로 재구현한다. "디자인 핸드오프 구현", "핸드오프 적용", "프로토타입 반영", "디자인 적용해줘", "UI 개선 구현", "그린 디자인 적용", "디자인 토큰 마이그레이션", "화면 재구현", "디자인 시스템 구축", "design handoff 구현", "다시 구현", "재실행", "디자인 업데이트", "특정 화면만 다시", "이전 구현 개선" 요청 시 반드시 이 스킬을 사용하라. (주의: 기존 앱을 평가/감사하는 ux-audit과 다르다 — 이 스킬은 핸드오프를 코드로 구현/생성한다.)
---

# UI/UX Implementation Orchestrator — 핸드오프 → 코드

`design_handoff_yaksaro_care`의 hi-fi 프로토타입을 실제 코드베이스에 재구현하는 에이전트 팀을 조율한다. **실행 모드: 에이전트 팀 (생성-검증 + 기반 파이프라인).**

## 역할 경계 (다른 하네스와 구분)

- 이 하네스 = 핸드오프 디자인을 **구현(생성)**. 트리거: "디자인 적용/구현", "핸드오프", "프로토타입 반영".
- `ux-audit`/app-evaluation = 기존 앱 **평가**(생성 아님).
- `v1-dev-orchestrator`/frontend-engineer = V1 **코어 기능** 개발(디자인 핸드오프 아님).
요청이 "구현/적용/반영"이면 이 하네스, "평가/점검/감사"면 평가 하네스.

## Phase 0: 컨텍스트 확인

1. `_workspace/ui/` 존재 여부 확인:
   - **미존재** → 초기 구현
   - **존재 + 사용자가 특정 화면/부분 수정 요청** → 부분 재실행 (해당 에이전트만 재호출, 산출물 이어쓰기)
   - **존재 + 사용자가 새 핸드오프/전면 갱신 요청** → 기존 `_workspace/ui/`를 `_workspace/ui_prev/`로 이동 후 새 실행
2. **모든 에이전트가 공통으로 `design_handoff_yaksaro_care/README.md`를 읽도록** 작업 지시에 명시한다(단일 진실 공급원).
3. 사용자에게 실행 모드(초기/부분/전면)와 대상 화면을 확인받고 진행.

## Phase 1: 팀 구성 및 기반 구축

**실행 모드:** 에이전트 팀

1. `TeamCreate`로 팀 구성 (3명, 전원 `model: "opus"`):
   - `design-system-engineer` — 토큰·폰트·키프레임·공유 컴포넌트
   - `screen-implementer` — 9개 화면 재구현
   - `design-qa-reviewer` — 검증(general-purpose)
2. `TaskCreate`로 작업 등록 (의존성 명시):
   - T1: 디자인 시스템 기반 (design-system-engineer) — **선행**
   - T2: 화면 재구현 (screen-implementer) — T1의 토큰 단계 완료 후 시작
   - T3: 점진적 QA (design-qa-reviewer) — T1·T2 산출 단위로 상시
3. design-system-engineer가 **토큰 → 키프레임 → 컴포넌트** 순으로 완성하며 각 단계 완료를 screen-implementer에 SendMessage 통지.

## Phase 2: 화면 재구현 (점진적 QA 동반)

- screen-implementer는 토큰 준비 통지를 받으면 착수. 컴포넌트 미완 시 토큰만으로 가능한 화면부터.
- **화면 1개 완료 → design-qa-reviewer 즉시 검증 → FAIL은 SendMessage 회신 → 수정 → 재검증.** 전체 완성 후 1회 QA로 미루지 않는다(경계면 버그 조기 발견).
- 화면 우선순위(권장): 자주 보는 핵심부터 — Home → Wallet → Today → Landing → 나머지(Calendar/Share/Settings/AddMed/OCR). 사용자가 지정하면 그 순서 우선.

## Phase 3: 통합 검증 및 종합

1. design-qa-reviewer가 전체 `npx tsc --noEmit` + 규제 grep + 토큰 잔존 grep으로 최종 패스.
2. 차단(blocker) 0건 확인. 규제 위반은 무조건 해소 후 종료.
3. 오케스트레이터가 `_workspace/ui/00_summary.md`에 [완료 화면 · 변경 파일 · 미해결 이슈 · 폰트 상태]를 종합.
4. 팀 정리. 사용자에게 결과 + 개발 서버 재시작/모바일 캐시 안내(이 프로젝트의 알려진 모바일 캐시 이슈).

## 데이터 전달 프로토콜

- **태스크 기반**(조율): TaskCreate/Update로 T1→T2 의존, T3 상시.
- **파일 기반**(산출물): 실제 코드 + `_workspace/ui/01_design-system_output.md`·`02_screens_output.md`·`03_qa_report.md`.
- **메시지 기반**(실시간): 단계 완료 통지, QA 결함 회신.
- 최종 산출물 = 실제 코드. `_workspace/ui/`는 감사 추적용으로 보존.

## 에러 핸들링

- 에이전트 1회 실패 → 재시도 1회, 재실패 시 해당 부분 누락 명시하고 진행(전체 중단 금지).
- 규제 위반 발견 → **예외: 반드시 해소 후 종료**(누락 진행 불가).
- Paperlogy 폰트 파일 부재 → 차단 아님, fallback 진행 + 사용자에게 파일 배치 안내.
- `lucide-react` 미설치 → 설치 필요를 사용자에 보고(임의 설치 전 확인).
- 데이터 쿼리와 새 UI shape 불일치 → 백엔드 변경 금지, 표현 매핑 또는 사용자 보고.

## 팀 크기

3명(소~중규모). 기반 1 + 구현 1 + 검증 1로 조율 오버헤드 최소. 9개 화면이 많지만 화면은 순차+점진 QA로 처리하므로 구현자를 늘리지 않는다(공유 컴포넌트 동시 편집 충돌 방지).

## 테스트 시나리오

**정상 흐름:** "디자인 핸드오프 적용해줘" → Phase 0 초기 판정 → 팀 구성 → design-system이 그린 토큰+Paperlogy+키프레임+YC 컴포넌트 구축 → screen-implementer가 Home부터 재구현(데이터 보존) → 화면마다 QA 통과 → tsc 통과·규제 0건 → 요약 보고.

**에러 흐름(규제 위반):** screen-implementer가 MedRow에 "복용을 중단하세요" 렌더 → design-qa-reviewer가 grep으로 차단 탐지 → SendMessage로 안전 표현("약사와 상담해보세요") 수정 요청 → 수정 → 재검증 PASS → 진행.

**부분 재실행:** "Wallet 화면만 다시" → Phase 0이 `_workspace/ui/` 존재 감지 → screen-implementer만 재호출, Wallet만 수정 → QA Wallet 재검증 → 02_screens_output.md 갱신.
