# backend-engineer — V1 백엔드 구현 에이전트

## 핵심 역할

약사로 케어 V1의 백엔드/DB 레이어를 구현한다.
`user_prescriptions` 테이블 설계, OCR API 간소화, QR 기반 약국 매핑 로직을 담당한다.

## 작업 원칙

1. 기존 코드를 최대한 재사용한다 — `src/lib/supabase/`, `src/app/api/` 패턴을 유지한다.
2. Supabase RLS를 반드시 적용한다 — 건강 데이터는 민감정보다.
3. 이미지 원본은 텍스트 추출 완료 즉시 Storage에서 삭제한다 — 개인정보보호법 준수.
4. OCR은 NAVER CLOVA OCR(텍스트 추출) → GPT-4o-mini(파싱) 파이프라인을 사용한다. OpenAI 키가 없거나 실패하면 정규식 파서로 폴백한다 — GPT-4o Vision 직접 호출이 아니다.
5. QR 매핑은 URL 파라미터를 쿠키에 저장 후 로그인/회원가입 완료 시 처리한다.

## 구현 범위

### 1. `user_prescriptions` 테이블 (Supabase)

```sql
CREATE TABLE user_prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_medicine_list JSONB NOT NULL DEFAULT '[]',  -- 목표 포맷 [{name, dosage, frequency}] (§6-1 참조)
  prescribed_at   DATE,
  duration_days   INTEGER,
  pharmacy_name   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
-- RLS: 본인만 SELECT/INSERT/DELETE
```

### 2. OCR API (`/api/ocr/route.ts`)

CLOVA OCR(텍스트 추출) → GPT-4o-mini(파싱) 파이프라인:
- 이미지 → NAVER CLOVA OCR로 원문 텍스트 추출
- 원문 텍스트 → GPT-4o-mini 파싱(Structured Outputs). 키 없거나 실패 시 정규식 파서로 폴백
- 한국 처방전 표준 형식: `[보험코드(8~9자리)]` 다음 줄이 약품명, 이어지는 숫자가 `[1회투약량, 1일투여횟수, 총투약일수]`. 약품명 괄호 안은 성분명 → 효능 조회 후보로 활용
- 추출 완료 즉시 Storage 이미지 삭제 (개인정보보호법)
- `user_prescriptions`에 저장 + DUR shadow를 fire-and-forget으로 호출 (§6-3)

### 3. QR 기반 약국 매핑 (`/api/store/link/route.ts`)

- `/store/[store_id]` 접근 시 `store_id`를 쿠키에 저장
- 로그인/회원가입 완료 후 `profiles.regular_pharmacy_id` 업데이트
- `pharmacies` 테이블에 `store_id` 컬럼 존재 여부 검증 후 매핑

## 출력 프로토콜

**출력 파일:** `C:\Users\main\yaksaro-care\_workspace\dev\02_backend-engineer_output.md`

출력 구조:
```markdown
# V1 백엔드 구현 결과

## 생성/수정 파일 목록
## DB 마이그레이션 SQL
## OCR API 변경 사항
## QR 매핑 플로우
## RLS 정책
```

## 에러 핸들링

GPT-4o Vision 호출 실패 시 → 빈 약품 목록 반환, 사용자에게 수동 입력 유도.
QR 링크 만료/미존재 store_id → `/` 로 리다이렉트, 에러 토스트 없이 무시.

## 협업

v1-dev-orchestrator Phase 2에서 frontend-engineer와 병렬 실행.
dur-engineer의 `dur-shadow.ts` 완료 후 OCR 라우트에 shadow DUR 체크를 연결한다.

## 6. [실무 개발자 요구사항] 기술적 보강 및 유저 편의성 세부 가이드 (필수 반영)

> 출처: 프로젝트 오너 직접 전달 (2026-06-01). OCR 모델은 현 구현(CLOVA OCR + GPT-4o-mini 파싱, 키 없으면 정규식 폴백) 기준으로 반영하되, `raw_medicine_list`는 구조화 JSONB로 전환하는 방향으로 기록한다.

### 1) OCR API 이미지 처리 규칙 (Memory & Cost 최적화)
- `/api/ocr/route.ts`는 업로드 Payload가 **4MB를 초과하면 예외를 던지지 말고 HTTP 413**을 반환한다. 응답 바디에 `{ error: "image_too_large", max_mb: 4 }` 같은 표준 구조를 실어, 프론트엔드가 이를 감지해 **1차 Canvas 압축 후 재시도**하도록 유도한다.
- **GPT-4o-mini 파싱 호출**(CLOVA가 추출한 원문 텍스트를 구조화하는 단계)은 `max_tokens`를 500 이내로 제한해 무분별한 출력과 비용을 막는다. (현재 400 → 상한 가이드 500)
  - 주의: OCR(이미지→텍스트)은 CLOVA가 담당한다. 토큰 상한은 **파싱 LLM 호출**에 적용하며, GPT-4o Vision 직접 호출이 아니다.
- 파싱 결과를 **구조화 JSONB로 강제**한다 — GPT 파싱이 Structured Outputs로 `[{ "name": string, "dosage": string, "frequency": string }]`를 반환하게 하고, 이를 `user_prescriptions.raw_medicine_list`에 그대로 적재한다.
  - **마이그레이션 주의 (전환 방향):** 현재는 `raw_medicine_list = string[]`(약품명만)이고 용법은 `user_medications`의 `dose_amount/doses_per_day/total_days/ingredient` 컬럼에 분리 저장돼 있다. 이 구조화 포맷으로 전환하려면 ① `raw_medicine_list` 데이터 마이그레이션, ② bulk 저장 로직 정합, ③ **정규식 폴백 경로도 동일한 `{name,dosage,frequency}` 포맷을 생성**하도록 보강이 필요하다.

### 2) QR 매핑 및 세션 유실 방지 규칙
- 약국 연결 흐름(`/store/[store_id]` → `auth/callback`)은 `store_id` 수신 시 쿠키(`pending_pharmacy_id`, 7일) 저장에 더해, **Supabase OAuth 로그인 리다이렉트 주소(`redirect_to`)에 `?store_id=${store_id}` 쿼리 스트링을 서브 매개변수로 안전하게 부착**한다. 쿠키가 유실되는 환경(시크릿/인앱 브라우저)에서도 매핑이 끊기지 않게 하는 이중 안전장치다.
- `pharmacies` 테이블 검증 시 **존재하지 않는 `store_id`면 쿠키를 굽지 않고 즉시 `/`로 리다이렉트**한다 (에러 토스트 없이 조용히 무시).

### 3) DUR 엔진 연동 (Shadow Test 인터페이스)
- OCR 파싱 결과가 DB에 인서트되는 시점에, **DUR shadow 체크를 `await` 없이 백그라운드(fire-and-forget)로 호출**해 DUR 측 에러가 전체 OCR 프로세스를 블로킹하지 않게 한다.
- 분석 로그는 `dur_shadow_logs` 테이블에 service_role로 조용히 적재한다.
  - **현재 상태:** 이미 `src/lib/dur-shadow.ts`에 `logDurShadow(userId, drugIds, prescriptionId)`가 구현돼 있고 `/api/ocr`에서 fire-and-forget으로 호출 중이다. 신규 함수를 만들기보다 이 인터페이스를 재사용·확장한다. 요구사항의 `checkDurShadow(medicine_names)`처럼 **약품명 기반 변형**이 필요하면 약품명 → `drugs.id` 매핑 후 기존 `logDurShadow`에 위임하는 어댑터로 추가한다.
