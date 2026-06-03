---
name: tech-design
description: 약사로 케어 기술 아키텍처를 설계하는 스킬. Supabase PostgreSQL ERD, RLS 정책, Next.js API 구조, GPT-4o Vision OCR 파이프라인, DUR API 기반 약물 상호작용 엔진을 설계한다. PharmMatch(Next.js+Supabase) 스택을 재사용한다. tech-architect 에이전트가 이 스킬을 사용한다.
---

# 기술 설계 방법론

## PharmMatch 재사용 패턴

PharmMatch(C:\Users\main\pharmatch\)와 동일한 스택을 사용한다:
- Next.js 16 (App Router, TypeScript, Tailwind CSS)
- Supabase (Auth + PostgreSQL + Storage + Realtime)
- shadcn/ui v4
- Vercel 배포

재사용 가능한 컴포넌트:
- Supabase Auth 설정 패턴
- RLS 정책 구조
- API Route 미들웨어 (인증 검사)
- shadcn/ui 컴포넌트 라이브러리

## DB 설계 원칙

1. 건강정보 컬럼은 암호화 (pgcrypto 또는 애플리케이션 레이어 AES-256)
2. 모든 테이블에 `created_at`, `updated_at` 타임스탬프
3. soft delete (`deleted_at`) 사용 — 의료 데이터는 물리 삭제 지양
4. 약품 마스터는 외부 API(식약처) 주기적 동기화 테이블 별도 관리

## 핵심 테이블 설계

```sql
-- 사용자 프로필 (auth.users 확장)
profiles (
  id uuid PK FK auth.users,
  user_type text CHECK (user_type IN ('patient', 'pharmacist')),
  birth_year int,
  gender text,
  allergies text[],
  created_at timestamptz DEFAULT now()
)

-- 약품 마스터 (식약처 동기화)
drugs (
  id text PK,               -- 식약처 품목기준코드
  name_ko text NOT NULL,
  name_en text,
  ingredients jsonb,        -- [{name, amount, unit}]
  category text,
  dosage_form text,
  atc_code text,            -- WHO ATC 코드
  updated_at timestamptz
)

-- 처방전
prescriptions (
  id uuid PK DEFAULT gen_random_uuid(),
  user_id uuid FK profiles,
  issued_at date,
  hospital text,
  ocr_raw jsonb,           -- GPT Vision 원본 결과
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
)

-- 현재 복용약
user_medications (
  id uuid PK DEFAULT gen_random_uuid(),
  user_id uuid FK profiles,
  drug_id text FK drugs,
  prescription_id uuid FK prescriptions,
  dosage text,
  frequency text,
  start_date date,
  end_date date,
  is_active boolean DEFAULT true,
  source text CHECK (source IN ('prescription', 'otc', 'supplement', 'manual'))
)

-- 상호작용 캐시 (DUR API 결과)
interactions (
  drug_a text,
  drug_b text,
  severity text CHECK (severity IN ('contraindicated', 'caution', 'safe')),
  description_ko text,
  source text,
  cached_at timestamptz DEFAULT now(),
  PRIMARY KEY (drug_a, drug_b)
)

-- 약국
pharmacies (
  id uuid PK DEFAULT gen_random_uuid(),
  owner_user_id uuid FK profiles,
  name text NOT NULL,
  license_no text UNIQUE,
  subscription_tier text DEFAULT 'free'
)

-- 약국-환자 연결
pharmacy_patients (
  pharmacy_id uuid FK pharmacies,
  patient_id uuid FK profiles,
  connected_at timestamptz DEFAULT now(),
  PRIMARY KEY (pharmacy_id, patient_id)
)
```

## RLS 정책

```sql
-- profiles: 본인만
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "본인만 조회" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "본인만 수정" ON profiles FOR UPDATE USING (auth.uid() = id);

-- user_medications: 본인 + 연결된 약사
CREATE POLICY "본인 또는 연결 약사" ON user_medications FOR SELECT USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM pharmacy_patients pp
    JOIN pharmacies p ON p.id = pp.pharmacy_id
    WHERE pp.patient_id = user_medications.user_id
    AND p.owner_user_id = auth.uid())
);
```

## OCR 파이프라인

상세 설계는 `references/schema-design.md` 참조.

핵심 단계:
1. 클라이언트 → API Route: 이미지 FormData 업로드
2. API Route: Supabase Storage 저장 (path: prescriptions/{user_id}/{uuid})
3. GPT-4o Vision 호출 (structured output)
4. 약품명 → drugs 테이블 fuzzy match (pg_trgm)
5. prescriptions 저장 → 클라이언트 확인

## 상호작용 분석 엔진

캐시 우선 → DUR API 폴백:
1. interactions 테이블에서 약품 쌍 조회
2. cached_at < now() - interval '7 days' 이면 갱신
3. DUR API 호출 → 결과 캐싱
4. severity 기준 응답: contraindicated(RED) / caution(YELLOW) / safe(GREEN)
