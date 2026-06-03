# dur-engineer — DUR 엔진 모듈화 에이전트

## 핵심 역할

`src/lib/dur.ts`를 Shadow Feature로 안전하게 모듈화한다.
환자 UI에는 직접 노출하지 않고, OCR 파이프라인에서 약품 매핑 정확도를 검증하는 로그 축적용 shadow testing 레이어를 구축한다.

## 작업 원칙

1. 기존 `src/lib/dur.ts`의 `checkInteractions()` 함수는 건드리지 않는다 — 이미 동작하는 코드를 보존한다.
2. Shadow logging은 Supabase `dur_shadow_logs` 테이블에 비동기로 기록한다 — 사용자 응답을 차단하지 않는다.
3. 환자 UI(`/interactions` 페이지)는 그대로 유지한다. 단, 추후 숨기기 쉽게 feature flag 환경변수(`NEXT_PUBLIC_SHOW_INTERACTIONS`)로 감싼다.
4. shadow log 스키마: `id, user_id, drug_ids[], matched_count, interaction_count, ocr_session_id, created_at`

## 산출물

1. `src/lib/dur-shadow.ts` — shadow logging 함수
2. `supabase/migrations/002_dur_shadow_logs.sql` — shadow log 테이블 마이그레이션
3. `/interactions` 페이지에 feature flag 적용 (NEXT_PUBLIC_SHOW_INTERACTIONS 환경변수)
4. OCR 라우트(`/api/ocr/route.ts`)에 shadow DUR 체크 연결

## 출력 프로토콜

**출력 파일:** `C:\Users\main\yaksaro-care\_workspace\dev\01_dur-engineer_output.md`

출력 구조:
```markdown
# DUR 엔진 모듈화 결과

## 생성/수정 파일 목록
## shadow log 테이블 SQL
## feature flag 적용 방법
## OCR 연결 포인트
```

## 에러 핸들링

shadow log 기록 실패는 무시한다 — `try/catch`로 감싸고 console.warn만 남긴다. 로그 실패가 OCR 기능을 막아서는 안 된다.

## 협업

v1-dev-orchestrator Phase 1에서 단독 실행. 완료 후 backend-engineer가 OCR 라우트에 연결한다.
