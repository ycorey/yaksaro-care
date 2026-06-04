---
name: pharmacist-mode-orchestrator
description: 약사로케어 B2B 약사 모드(약국 read-only 대시보드) 개발 오케스트레이터. regulatory-analyst·tech-architect·backend-engineer·frontend-engineer·design-system-engineer·pharmacy-security-engineer·design-qa-reviewer를 에이전트 팀으로 협업시켜, 약사가 동의한 단골 환자의 복약을 읽기 전용으로 보는 대시보드를 규제·보안 게이트 기반으로 개발한다. "약사 모드", "약국 대시보드", "약사 화면 개발", "단골 환자 조회", "약사 read-only", "약사 RLS", "약국 B2B", "pharmacist mode", "다시 실행", "재실행", "약사 모드 업데이트", "약사 대시보드 보완" 요청 시 반드시 이 스킬을 사용하라. (주의: 환자용 코어 개발은 v1-dev-orchestrator, 디자인 핸드오프 구현은 ui-ux-implementation-orchestrator — 이 스킬은 약사/약국 B2B 영역 전용이다.)
---

# Pharmacist Mode Orchestrator — 약사 모드 개발

약사(약국)가 **타인(환자)의 민감 복약정보를 읽는** 기능을 만든다. 일반 CRUD가 아니라 **규제·동의·RLS 보안이 선행 게이트**인 작업이다. **실행 모드: 에이전트 팀**, Phase 게이트 구조.

## 역할 경계 (다른 하네스와 구분)

- 이 하네스 = 약사/약국 **B2B 영역**(약사 인증·역방향 RLS·약사 대시보드). 트리거: "약사 모드", "약국 대시보드", "약사 RLS".
- `v1-dev-orchestrator` = 환자용 코어(약지갑·OCR·DUR·QR).
- `ui-ux-implementation-orchestrator` = 디자인 핸드오프를 코드로 구현.
요청이 "약사/약국이 환자를 본다"면 이 하네스.

## 핵심 원칙

1. **규제·보안이 선행 게이트다.** 약사가 환자 민감정보를 보는 *합법 구조와 동의 모델*이 확정돼야 스키마·API·UI가 나온다. Phase 1 합의 없이는 Phase 2로 못 간다.
2. **동의 ≠ 관계.** QR 단골(`regular_pharmacy_id`)은 관계일 뿐, 열람의 적법 근거가 아니다. **명시적 opt-in 동의**가 RLS의 AND 조건이어야 한다.
3. **방어는 DB(RLS) 레이어.** 약사 조회는 사용자 토큰 + RLS로. `service_role`(admin) 우회 금지.
4. **read-only 최소권한.** 약사용 쓰기 정책·수정 UI 없음. 노출 필드 최소.
5. **MVP는 코어만.** 이미 연결+동의한 단골 환자 조회·검색. 약국 계정은 관리자 수동 발급 가정.

## Phase 0: 컨텍스트 확인

`_workspace/pharmacy/` 존재 여부로 분기:
- 미존재 → 초기 개발
- 존재 + 부분 수정 요청 → 해당 에이전트만 재호출(산출물 이어쓰기)
- 존재 + 전면 갱신 → `_workspace/pharmacy/`를 `_workspace/pharmacy_prev/`로 이동 후 새 실행

## Phase 1: 규제·아키텍처 선행 게이트 (필수)

`TeamCreate`로 팀 구성(전원 `model: "opus"`). 이 Phase는 **2명 단독 설계 후 합의**.
- `regulatory-analyst` (스킬: regulatory-analysis) — 약사 단골 환자 복약 열람의 합법 구조. **프롬프트 보강 주입**: ① 개인정보 제3자 제공 vs 위탁의 법적 성격 ② 의료법 27조(약사=유자격자라 비의료인 경계 리스크 낮음, 역방향 재해석) ③ 약사법 복약지도 권한과 앱 역할 경계 ④ opt-in 동의 문구·철회권. 산출 `_workspace/pharmacy/01_regulatory.md`.
- `tech-architect` (스킬: tech-design) — **프롬프트 보강 주입**: "약사 역방향 접근". 동의 저장 방식(`profiles.consent_pharmacist_view` 등) + 약사 SELECT RLS 초안(관계 AND 동의) + read-only 조회 API/쿼리 + 대시보드 데이터모델. 기존 무효 `medications_pharmacist` 교체 설계. 산출 `02_architecture.md`.
- **게이트:** 두 산출물이 정합(동의 모델 ↔ RLS)해야 Phase 2. 불법/누수 구조면 중단·재설계.

## Phase 2: 약사 백엔드 + RLS 보안

- `backend-engineer` (스킬: pharmacy-dashboard-build) — 환자측 동의 토글(설정) + role 가드 미들웨어(`/pharmacy/*`) + read-only 약사 조회(사용자 토큰+RLS, admin 금지). 014 마이그레이션 작성(SQL Editor 수동 실행 안내).
- `pharmacy-security-engineer` (스킬: pharmacy-rls-security) — RLS 정책 확정 + 누수 테스트(미동의·타약국·철회 환자 SELECT=0건 assert) + service_role 우회 탐지. 결함 시 backend에 SendMessage 회신, 수정 후 재검증. **누수=차단, 해소 전 Phase 3 금지.**

## Phase 3: 대시보드 프론트

- `design-system-engineer` + `frontend-engineer` (스킬: pharmacy-dashboard-build) — `/pharmacy` 대시보드(단골 환자 목록·환자별 복약 read-only·검색), YC 토큰 재사용, role 게이트. 규제 안전(복약지도/처방변경/복용중단 지시 문구 없음, 읽기 전용).

## Phase 4: 보안·규제·통합 QA (점진적)

- `pharmacy-security-engineer` — 최종 누수·권한·동의철회 즉시반영 재검증.
- `design-qa-reviewer` (스킬: design-qa-review) — tsc·`npm run build`·규제 문구 grep·토큰·데이터 shape. (RLS 누수 축은 security-engineer 전담 — 중복 회피.)
- 차단 0건 확인 후 종합. `_workspace/pharmacy/00_summary.md`에 변경 파일·미해결·수동 조치(014 마이그레이션 실행·약국 계정 발급) 기록.

## 데이터 전달 프로토콜

- **태스크 기반**(조율): Phase 1 게이트 → 2 → 3 → 4 의존.
- **파일 기반**(산출물): 실제 코드 + `_workspace/pharmacy/*.md`.
- **메시지 기반**(실시간): security→backend 누수 회신, 게이트 합의.
- 최종 산출물 = 실제 코드. `_workspace/pharmacy/`는 감사 추적용 보존.

## 에러 핸들링

- 에이전트 1회 실패 → 재시도 1회, 재실패 시 누락 명시 진행(전체 중단 금지).
- **예외(차단, 해소 필수):** 규제 위반 구조, RLS 누수(타인 데이터 노출), service_role 우회, 약사 쓰기 권한. 이 중 하나라도 미해소면 종료 불가.
- 상충 설계(규제 vs 아키텍처)는 삭제 말고 병기 후 Phase 1 재합의.

## 팀 크기

소~중규모. Phase별 2~3명 집중(설계 게이트 2 → 백엔드+보안 2 → 프론트 2 → QA 2). 보안과 구현을 분리해 견제.

## 테스트 시나리오

**정상 흐름:** "약사 모드 만들어줘" → Phase 0 초기 → Phase 1 규제+아키텍처 합의(동의 모델+RLS) → Phase 2 backend가 동의토글·role가드·read-only 조회 구현, security가 누수테스트 PASS → Phase 3 /pharmacy 대시보드 → Phase 4 tsc·빌드·규제 0·누수 0 → 요약(014 실행·약국계정 발급 안내).

**에러 흐름(누수):** security-engineer가 "약사 A가 미동의 환자 P2를 읽음" 탐지 → backend에 SendMessage(RLS 동의 게이트 AND 누락, 파일:라인) → backend 정책 수정(consent AND 추가) → 재검증 PASS → Phase 3 진입.

**부분 재실행:** "약사 대시보드 검색만 다시" → Phase 0이 `_workspace/pharmacy/` 감지 → frontend만 재호출, 검색 부분 수정 → security/design-qa 재검증.
