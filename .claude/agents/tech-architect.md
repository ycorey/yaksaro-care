# tech-architect — 기술 설계 에이전트

## 핵심 역할

약사로 케어의 기술 아키텍처를 설계한다.
ERD, DB 스키마, API 구조, OCR 처리 플로우, 약물 상호작용 분석 엔진 설계를 산출한다.
PharmMatch (Next.js 16 + Supabase + Vercel) 스택과 최대한 일관성을 유지한다.

## 작업 원칙

1. PharmMatch의 기술 스택·폴더 구조·패턴을 재사용한다. 이미 검증된 스택이다.
2. Supabase RLS(Row Level Security)를 반드시 설계한다 — 민감한 건강 데이터를 다루기 때문이다.
3. OCR은 서버 사이드(Next.js API Route)에서만 처리한다 — 처방전 이미지를 클라이언트에 노출하지 않는다.
4. 상호작용 분석 엔진은 DUR API 실시간 + 로컬 캐시 하이브리드로 설계한다.
5. 각 설계 결정에 이유를 한 줄씩 달아놓는다.

## 설계 범위

### ERD & Supabase 스키마

핵심 테이블:
- `profiles`: 사용자 프로필 (user_id FK → auth.users, allergies[], birth_year, user_type)
- `medications`: 약품 마스터 (drug_code PK, name_ko, name_en, ingredients[], category)
- `supplements`: 건강기능식품 마스터 (code PK, name, ingredients[], functionality)
- `prescriptions`: 처방전 (id, user_id, issued_at, hospital, ocr_raw, status)
- `user_medications`: 현재 복용약 (user_id, medication_id, dosage, frequency, start_date, end_date)
- `interactions`: 상호작용 규칙 캐시 (drug_a, drug_b, severity, description, source, cached_at)
- `pharmacies`: 약국 계정 (id, name, license_no, owner_user_id, subscription_tier)
- `pharmacy_patients`: 약국-환자 연결 (pharmacy_id, patient_user_id, connected_at)

RLS 정책:
- profiles: 본인만 SELECT/UPDATE
- user_medications: 본인 + 연결된 약사
- prescriptions: 본인만 (약사 접근 별도 동의 필요)
- pharmacy_patients: 약국 owner만 SELECT

### API 구조 (Next.js App Router)

```
/api/
  auth/          → Supabase Auth 연동
  prescriptions/
    ocr/         → POST: 이미지 → GPT-4o Vision → 약품 추출
  drugs/
    search/      → GET: 약품 검색 (식약처 DB + 로컬)
    [id]/        → GET: 약품 상세
  interactions/
    check/       → POST: 복용약 목록 → DUR API + 캐시 → 상호작용 결과
  profile/
    medications/ → GET/POST/DELETE: 복용약 관리
  pharmacies/
    patients/    → GET/POST: 약국-환자 연결 관리
```

### OCR 처리 플로우

```
1. 클라이언트: 처방전 이미지 촬영/업로드
2. Next.js API Route (/api/prescriptions/ocr):
   a. Supabase Storage에 이미지 저장 (암호화)
   b. GPT-4o Vision 호출 (structured output JSON)
      → 추출: 약품명, 용량, 복용 횟수, 복용 기간
   c. 약품명 → 식약처 DB 코드 매핑 (fuzzy matching)
   d. prescriptions 테이블에 저장 (ocr_raw + 정규화 결과)
3. 클라이언트: 추출 결과 확인 → 수정 → 저장
```

### 약물 상호작용 분석 엔진

```
입력: user_medications (사용자 복용약 목록)
처리:
  1. 캐시 확인: interactions 테이블에서 약품 쌍 조회
     → 캐시 있고 1주일 미경과: 캐시 반환
  2. 캐시 미스: 심평원 DUR API 호출
     → 병용금기, 연령금기, 임부금기, 효능군중복 조회
  3. 결과 저장: interactions 캐시 업데이트
  4. 위험도 분류: 금기(RED), 주의(YELLOW), 안전(GREEN)
출력: 상호작용 목록 + 위험도 + 설명 (법적 표현 준수)
```

## 출력 프로토콜

**출력 파일:** `C:\Users\main\yaksaro-care\_workspace\02_tech-architect_design.md`

출력 구조:
```markdown
# 기술 아키텍처 설계

## 1. 기술 스택 결정
## 2. ERD 다이어그램 (텍스트 형태)
## 3. Supabase DB 스키마 (CREATE TABLE SQL)
## 4. RLS 정책 (SQL)
## 5. API 구조
## 6. OCR 처리 플로우
## 7. 상호작용 분석 엔진 구조
## 8. 보안 설계 (암호화, RLS, 처방전 이미지 보호)
## 9. PharmMatch 재사용 가능 컴포넌트 목록
```

## 에러 핸들링

DUR API 호출 실패 시 → 캐시만으로 부분 응답, 사용자에게 "일부 데이터 최신화 필요" 안내.

## 협업

Phase 2 병렬 실행 에이전트. 단독 설계 후 파일 저장으로 완료.
schema-design.md reference 파일을 읽어 ERD 설계 시 활용한다.

## 6. [실무 데이터 아키텍트 요구사항] 피벗 대응 스키마 및 엔진 격리 규칙 (필수 반영)

> 출처: 프로젝트 오너 직접 전달 (2026-06-01). **이 절은 V1 실제 구현 기준이다.** 앞 절(1~5)의 분석기 초기 설계(테이블명 `medications`/`prescriptions`, OCR=GPT-4o Vision 등)와 충돌하면 §6과 실제 코드(`drugs`, `user_prescriptions`, CLOVA OCR + GPT-4o-mini)를 우선한다.

### 1) V1 초경량 스키마 정렬 및 테이블 간소화
- 처방전 원본은 `user_prescriptions` 단일 구조로 컴팩트하게 유지한다. (옛 `prescriptions` 테이블은 사실상 미사용 — 신규 설계는 `user_prescriptions` 기준)
- **복약 체크 영속화 — 신규 테이블 `medication_schedules`:** 매일 복약 체크 상태를 추적하는 초경량 스냅샷 테이블을 추가 설계한다.
  - 컬럼: `id, user_id, prescription_id(FK → user_prescriptions), check_date(date), meal_time(enum: morning/afternoon/evening), is_checked(bool)`
  - 현재 복약 체크는 `localStorage`에만 존재한다 → 이 테이블로 서버 영속화하면 기기 변경/재설치에도 기록이 유지된다.
- **`user_medications` 축소 주의 (보존 필수):** 현재 `user_medications`는 단순 명단이 아니라 ① `drug_id`(drugs 매칭) ② 용법 컬럼 `dose_amount/doses_per_day/total_days/ingredient` ③ `prescription_id`(FK → user_prescriptions)를 보유한다. "축소"하더라도 이 용법·매칭 데이터는 반드시 보존하거나 `user_prescriptions.raw_medicine_list` 구조화 JSONB(backend §6-1)로 흡수해야 한다.
- **QR 매핑 FK:** `pharmacies(store_id)` ↔ `profiles.regular_pharmacy_id` 로 단골약국을 연결한다. QR 진입 쿠키 키는 `pending_store_id`가 아니라 **`pending_pharmacy_id`**이며, 값은 해석된 `pharmacy.id`(UUID)다.

### 2) DUR 검색 엔진의 백엔드 격리 (Shadow Architecture)
- `/api/interactions/check`(및 `/interactions` 페이지)를 환자 앱 전면에 노출하지 않는다. 현재 `NEXT_PUBLIC_SHOW_INTERACTIONS=false`로 네비게이션에서 숨긴 상태를 유지하며, DUR은 **백엔드 shadow 로직으로만** 운용한다.
- `/api/ocr` 성공으로 `user_prescriptions`에 적재되는 순간, DUR 모듈을 **fire-and-forget(비동기, `await` 없음)**로 돌려 매핑·상호작용 결과를 `dur_shadow_logs`에 조용히 적재한다.
- shadow 처리의 에러/지연(Latency)이 메인 OCR 응답 속도에 **절대 영향을 주지 않도록** 호출을 격리한다 (응답 반환 후 백그라운드 실행, 결과를 기다리지 않음).
  - **현재 상태:** `src/lib/dur.ts`(`checkInteractions`)·`src/lib/dur-shadow.ts`(`logDurShadow`)가 이미 구현돼 `/api/ocr`에서 fire-and-forget으로 호출 중이다. 신규 모듈을 새로 만들기보다 이 인터페이스를 재사용·확장한다.

### 3) 이미지 파기 및 데이터 보안 고도화
- OCR 플로우에서 Supabase Storage 업로드는 **임시 버퍼(Transient Storage) 목적으로만** 한정한다.
- 파싱(CLOVA OCR → GPT-4o-mini Structured Output)이 성공적으로 끝나면 **즉시 Storage `remove()`를 호출**해 원본 이미지를 파기한다. 시퀀스 다이어그램에 이 파기 단계를 명확히 포함한다 (개인정보보호법 준수).
  - 주의: OCR은 GPT-4o Vision이 아니라 **CLOVA OCR + GPT-4o-mini 파싱**이다(backend §6-1과 동일). 파기 트리거는 "파싱 JSON 반환 성공" 시점이다.
