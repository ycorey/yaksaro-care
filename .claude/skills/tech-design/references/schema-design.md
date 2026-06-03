# 약사로 케어 — Supabase DB 스키마 상세 설계

이 파일은 tech-architect 에이전트가 기술 설계 시 참조하는 상세 스키마 문서다.

## 목차
1. ERD 다이어그램
2. 전체 CREATE TABLE SQL
3. 인덱스 전략
4. RLS 정책 전체
5. OCR 파이프라인 상세
6. 마이그레이션 순서

---

## 1. ERD 다이어그램 (텍스트)

```
auth.users (Supabase 내장)
    │
    ├─── profiles (1:1)
    │        │
    │        ├─── user_medications (1:N)
    │        │         └─── drugs (N:1)
    │        │         └─── prescriptions (N:1)
    │        │
    │        ├─── prescriptions (1:N)
    │        │
    │        └─── pharmacy_patients (N:M) ──── pharmacies
    │                                              │
    │                                         profiles (약사)
    │
drugs ───── interactions (N:M, 자기 참조)
    │
supplements ─── supplement_interactions (N:M)
```

---

## 2. 전체 CREATE TABLE SQL

```sql
-- ============================================
-- EXTENSION
-- ============================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- 약품명 fuzzy 검색

-- ============================================
-- PROFILES (auth.users 확장)
-- ============================================
CREATE TABLE profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  user_type     text        NOT NULL DEFAULT 'patient'
                            CHECK (user_type IN ('patient', 'pharmacist')),
  display_name  text,
  birth_year    smallint    CHECK (birth_year BETWEEN 1900 AND 2025),
  gender        text        CHECK (gender IN ('M', 'F', 'other')),
  allergies     text[]      DEFAULT '{}',  -- 알레르기 약품 코드 배열
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- ============================================
-- DRUGS (식약처 의약품 마스터)
-- ============================================
CREATE TABLE drugs (
  id            text        PRIMARY KEY,     -- 식약처 품목기준코드
  name_ko       text        NOT NULL,
  name_en       text,
  manufacturer  text,
  ingredients   jsonb       DEFAULT '[]',    -- [{name, amount, unit, type}]
  category      text,                        -- 전문/일반
  dosage_form   text,                        -- 정제, 캡슐, 주사 등
  atc_code      text,                        -- WHO ATC 코드
  is_prescription boolean  DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- 검색용 full-text 컬럼
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name_ko, '') || ' ' || coalesce(name_en, ''))
  ) STORED
);

CREATE INDEX idx_drugs_search ON drugs USING GIN(search_vector);
CREATE INDEX idx_drugs_name_trgm ON drugs USING GIN(name_ko gin_trgm_ops);

-- ============================================
-- SUPPLEMENTS (건강기능식품 마스터 - V2)
-- ============================================
CREATE TABLE supplements (
  id            text        PRIMARY KEY,     -- 식품안전나라 코드
  name          text        NOT NULL,
  manufacturer  text,
  ingredients   jsonb       DEFAULT '[]',
  functionality text[],                      -- 기능성 내용
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- PRESCRIPTIONS (처방전)
-- ============================================
CREATE TABLE prescriptions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  issued_at       date,
  hospital        text,
  prescriber      text,                      -- 처방 의사명 (선택)
  ocr_raw         jsonb,                     -- GPT Vision 원본 JSON
  ocr_status      text        DEFAULT 'pending'
                              CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed')),
  storage_path    text,                      -- Supabase Storage 이미지 경로
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- ============================================
-- USER_MEDICATIONS (복용약)
-- ============================================
CREATE TABLE user_medications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  drug_id         text        REFERENCES drugs(id),
  supplement_id   text        REFERENCES supplements(id),
  prescription_id uuid        REFERENCES prescriptions(id),
  -- drug_id 또는 supplement_id 중 하나는 필수
  CHECK (drug_id IS NOT NULL OR supplement_id IS NOT NULL),
  dosage          text,                      -- "500mg"
  frequency       text,                      -- "1일 3회"
  timing          text,                      -- "식후 30분"
  start_date      date,
  end_date        date,
  is_active       boolean     NOT NULL DEFAULT true,
  source          text        NOT NULL
                  CHECK (source IN ('prescription', 'otc', 'supplement', 'manual')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX idx_user_medications_user ON user_medications(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_medications_active ON user_medications(user_id, is_active) WHERE deleted_at IS NULL;

-- ============================================
-- INTERACTIONS (약-약 상호작용 캐시)
-- ============================================
CREATE TABLE interactions (
  drug_a          text        NOT NULL REFERENCES drugs(id),
  drug_b          text        NOT NULL REFERENCES drugs(id),
  severity        text        NOT NULL
                  CHECK (severity IN ('contraindicated', 'caution', 'monitor', 'safe')),
  description_ko  text,
  mechanism       text,
  source          text        DEFAULT 'dur_api',
  cached_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (drug_a, drug_b),
  CHECK (drug_a < drug_b)  -- 중복 방지 (A-B와 B-A를 동일하게 처리)
);

-- ============================================
-- PHARMACIES (약국)
-- ============================================
CREATE TABLE pharmacies (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid        NOT NULL REFERENCES profiles(id),
  name            text        NOT NULL,
  license_no      text        UNIQUE,
  address         text,
  phone           text,
  subscription_tier text      DEFAULT 'free'
                  CHECK (subscription_tier IN ('free', 'basic', 'pro')),
  subscription_expires_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- ============================================
-- PHARMACY_PATIENTS (약국-환자 연결)
-- ============================================
CREATE TABLE pharmacy_patients (
  pharmacy_id     uuid        NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  patient_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  connected_at    timestamptz NOT NULL DEFAULT now(),
  consent_given   boolean     NOT NULL DEFAULT false,  -- 환자 정보 공유 동의
  consent_at      timestamptz,
  PRIMARY KEY (pharmacy_id, patient_id)
);
```

---

## 3. RLS 정책 전체

```sql
-- PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- PRESCRIPTIONS
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prescriptions_own" ON prescriptions FOR ALL USING (auth.uid() = user_id);

-- USER_MEDICATIONS (본인 + 동의한 연결 약사)
ALTER TABLE user_medications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "medications_own_or_pharmacist" ON user_medications FOR SELECT USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM pharmacy_patients pp
    JOIN pharmacies p ON p.id = pp.pharmacy_id
    WHERE pp.patient_id = user_medications.user_id
      AND p.owner_user_id = auth.uid()
      AND pp.consent_given = true
  )
);
CREATE POLICY "medications_own_write" ON user_medications FOR ALL USING (auth.uid() = user_id);

-- PHARMACIES (약국 오너만)
ALTER TABLE pharmacies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pharmacy_owner" ON pharmacies FOR ALL USING (auth.uid() = owner_user_id);

-- PHARMACY_PATIENTS
ALTER TABLE pharmacy_patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp_pharmacy_owner" ON pharmacy_patients FOR SELECT USING (
  EXISTS (SELECT 1 FROM pharmacies p WHERE p.id = pharmacy_id AND p.owner_user_id = auth.uid())
);
CREATE POLICY "pp_patient_own" ON pharmacy_patients FOR SELECT USING (auth.uid() = patient_id);
```

---

## 4. OCR 파이프라인 상세

```
POST /api/prescriptions/ocr
Content-Type: multipart/form-data

1. 인증 확인 (Supabase session)
2. 이미지 유효성 검사 (크기 < 10MB, 포맷 JPEG/PNG/WEBP)
3. Supabase Storage 업로드:
   - Bucket: prescriptions (private)
   - Path: {user_id}/{uuid}.{ext}
4. prescriptions 레코드 생성 (ocr_status: 'processing')
5. GPT-4o Vision API 호출:
   - 시스템 프롬프트: 처방전 파싱 전문 지시
   - 응답 포맷 (structured output):
     {
       "drugs": [
         {
           "name": "아모크시실린",
           "dosage": "500mg",
           "frequency": "1일 3회",
           "duration": "5일",
           "timing": "식후"
         }
       ],
       "hospital": "서울내과의원",
       "issued_date": "2026-05-31",
       "confidence": 0.95
     }
6. 약품명 → drugs 테이블 매핑 (pg_trgm similarity > 0.6)
7. prescriptions 업데이트 (ocr_raw + ocr_status: 'completed')
8. 매핑된 drug_id 목록 반환 (사용자 확인용)

오류 처리:
- GPT API 실패: ocr_status: 'failed', 사용자에게 수동 입력 UI 제공
- 매핑 실패: confidence 점수와 함께 후보 목록 반환 (사용자 선택)
```

---

## 5. 마이그레이션 순서

```
001_initial_schema.sql       -- profiles, drugs 기본 테이블
002_prescriptions.sql        -- prescriptions, user_medications
003_interactions.sql         -- interactions 캐시 테이블
004_pharmacies.sql           -- pharmacies, pharmacy_patients
005_rls_policies.sql         -- 전체 RLS 정책
006_indexes.sql              -- 검색 인덱스
007_supplements.sql          -- V2: supplements, supplement_interactions
```
