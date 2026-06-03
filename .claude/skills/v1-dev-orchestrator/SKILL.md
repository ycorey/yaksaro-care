---
name: v1-dev-orchestrator
description: 약사로 케어 V1 Core 개발 오케스트레이터. "V1 구현해줘", "DUR 엔진 모듈화", "약 지갑 만들어줘", "QR 매핑 구현", "OCR 간소화", "wallet UI", "/store 라우트", "shadow testing 구현", "V1 파이프라인", "코어 기능 개발", "개발 시작", "다시 구현", "V1 업데이트", "백엔드 구현", "프론트엔드 구현" 요청 시 반드시 이 스킬을 사용하라. dur-engineer·backend-engineer·frontend-engineer 3개 에이전트를 순차/병렬로 협업시켜 V1 코어 파이프라인(DUR shadow, OCR 간소화, 약 지갑 UI, QR 매핑)을 구현한다.
---

# V1 Core 개발 오케스트레이터

## 실행 모드: 하이브리드

- **Phase 2**: `dur-engineer` 서브 에이전트 단독 실행 (DUR shadow 모듈 완성 선행)
- **Phase 3**: `backend-engineer` + `frontend-engineer` 서브 에이전트 병렬 실행

---

## Phase 0: 컨텍스트 확인

`C:\Users\main\yaksaro-care\_workspace\dev\` 존재 여부를 확인한다.

- 없음 → **초기 실행** → Phase 1부터
- 있고 `01_dur-engineer_output.md` 존재 + 사용자가 부분 수정 요청 → **부분 재실행** → 해당 에이전트만 재호출
- 있고 전체 재실행 요청 → `_workspace/dev/`를 `_workspace/dev_prev/`로 이동 후 초기 실행

---

## Phase 1: 워크스페이스 준비

`_workspace/dev/` 디렉토리 생성.

사용자에게 알림:
"V1 Core 개발을 시작합니다. Phase 1: DUR 엔진 모듈화 → Phase 2: 백엔드·프론트엔드 병렬 구현 순서로 진행합니다."

---

## Phase 2: DUR 엔진 모듈화 (서브 에이전트)

`dur-engineer` 에이전트를 단독 실행한다. 반드시 `model: "opus"`.

프롬프트에 포함할 내용:
- `dur-engine` 스킬 파일 읽기 지시
- 현재 `src/lib/dur.ts` 코드 읽기
- 현재 `src/app/api/ocr/route.ts` 코드 읽기
- 산출물: `src/lib/dur-shadow.ts`, `supabase/migrations/002_dur_shadow_logs.sql`, OCR 라우트 수정
- 출력 파일: `_workspace/dev/01_dur-engineer_output.md`

완료 대기 후 Phase 3 진행.

---

## Phase 3: 백엔드 + 프론트엔드 병렬 구현 (서브 에이전트)

`backend-engineer`와 `frontend-engineer`를 단일 메시지에서 동시 호출한다.
반드시 `model: "opus"`, `run_in_background: true`.

### backend-engineer 프롬프트

- `qr-pharmacy-mapping` 스킬 파일 읽기 지시
- Phase 2 결과(`_workspace/dev/01_dur-engineer_output.md`) 읽기
- 현재 `src/app/api/ocr/route.ts` 읽기
- 구현: `user_prescriptions` 테이블 마이그레이션, OCR API GPT-4o Vision 교체, `/store/[store_id]` 라우트, auth callback 쿠키 처리
- 출력 파일: `_workspace/dev/02_backend-engineer_output.md`

### frontend-engineer 프롬프트

- `wallet-ui` 스킬 파일 읽기 지시
- 현재 `src/components/dashboard/nav.tsx` 읽기
- 현재 `src/app/dashboard/layout.tsx` 읽기
- 구현: `/wallet` 레이아웃+페이지+체크박스, DashboardNav `/wallet` 항목 추가
- 출력 파일: `_workspace/dev/02_frontend-engineer_output.md`

---

## Phase 4: 완료 보고

오케스트레이터가 두 출력 파일을 읽고 요약 보고한다:

```
## V1 Core 구현 완료

### 생성/수정 파일
- [파일 목록]

### 다음 단계
1. `npm run dev`로 로컬 확인
2. Supabase Dashboard에서 마이그레이션 실행
3. .env.local에 NEXT_PUBLIC_SHOW_INTERACTIONS=false 추가
4. ETL DUR 재실행 (내일 오전, API 한도 리셋 후)
```

---

## 에러 핸들링

| 상황 | 처리 |
|------|------|
| dur-engineer 실패 | shadow 없이 Phase 3 진행, 보고서에 누락 명시 |
| backend-engineer 실패 | frontend만 완료 처리, DB 마이그레이션 수동 안내 |
| frontend-engineer 실패 | backend만 완료 처리, UI는 다음 세션에 재요청 안내 |

---

## 테스트 시나리오

**Should trigger:**
- "V1 구현 시작해줘"
- "약 지갑 페이지 만들어줘"
- "DUR shadow logging 붙여줘"
- "QR 매핑 구현해줘"
- "OCR 간소화해줘"
- "코어 기능 개발해줘"
- "다시 구현해줘"

**Should NOT trigger:**
- "약사로 케어 시장 조사해줘" (→ yaksaro-care-orchestrator)
- "투자 보고서 만들어줘" (→ yaksaro-care-orchestrator)
- "DUR ETL 돌려줘" (→ 직접 처리)
- "Supabase 연결 오류 고쳐줘" (→ 직접 처리)
