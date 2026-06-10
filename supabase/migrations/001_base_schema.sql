-- 001_base_schema.sql
-- 베이스 스키마 (운영 DB 역덤프, 2026-06-10 재구성)
--
-- 002 이전에 Supabase SQL Editor에서 수동 생성됐던 초기 스키마를 운영 DB에서
-- 역으로 덤프해 버전관리에 편입한 것. 신규 환경 재현·감사 목적이며,
-- 전부 IF NOT EXISTS / DROP-CREATE 패턴이라 기존 운영 DB에 재실행해도 무해하다.
-- 002~022가 추가한 컬럼·인덱스·정책은 의도적으로 제외 (마이그레이션 재생 순서 보존):
--   profiles.regular_pharmacy_id(003)·consent_pharmacist_view*(014),
--   drugs.image_url(008)·edi_code/is_canceled(016), pharmacies.store_id(003)·phone/address(017),
--   user_medications.dose_amount~ingredient(005)·has_interaction_warning(012)·meal_times(018) 등.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────
-- profiles: auth.users 1:1 확장
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             text NOT NULL,
  full_name         text,
  role              text NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'pharmacist')),
  phone             text,
  consent_health    boolean NOT NULL DEFAULT false,  -- 민감정보(건강) 수집 동의
  consent_health_at timestamptz,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_self" ON public.profiles;
CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 회원가입 시 profiles 자동 생성 (raw_user_meta_data → 컬럼 매핑)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, email, full_name, role, consent_health, consent_health_at)
  values (
    new.id,
    new.email,
    (new.raw_user_meta_data->>'full_name'),
    coalesce(new.raw_user_meta_data->>'role', 'patient'),
    coalesce((new.raw_user_meta_data->>'consent_health')::boolean, false),
    case
      when (new.raw_user_meta_data->>'consent_health')::boolean
      then (new.raw_user_meta_data->>'consent_health_at')::timestamptz
      else null
    end
  );
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────
-- drugs: 식약처 의약품 마스터 (ETL 적재)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.drugs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_seq        text NOT NULL UNIQUE,  -- 품목기준코드
  item_name       text NOT NULL,
  entp_name       text,
  ingredient_name text,
  ingredient_code text,                  -- DUR 성분코드 (성분기반 매칭용)
  etc_otc_name    text,                  -- 전문/일반
  chart           text,
  form_code_name  text,
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.drugs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drugs_read" ON public.drugs;
CREATE POLICY "drugs_read" ON public.drugs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_drugs_item_name
  ON public.drugs USING gin (item_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_drugs_ingredient_code
  ON public.drugs (ingredient_code);

-- ─────────────────────────────────────────────
-- supplements: 건강기능식품 마스터 (ETL 적재)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_seq   text NOT NULL UNIQUE,
  product_name  text NOT NULL,
  company_name  text,
  main_function text,
  caution       text,
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.supplements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplements_read" ON public.supplements;
CREATE POLICY "supplements_read" ON public.supplements
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_supplements_name
  ON public.supplements USING gin (product_name gin_trgm_ops);

-- ─────────────────────────────────────────────
-- interactions: DUR 병용금기 쌍 (drug_a_id < drug_b_id 정렬 불변)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_a_id   uuid NOT NULL REFERENCES public.drugs(id),
  drug_b_id   uuid NOT NULL REFERENCES public.drugs(id),
  severity    text NOT NULL CHECK (severity IN ('contraindicated', 'warning', 'monitor', 'ok')),
  description text,
  source      text NOT NULL DEFAULT 'dur_api' CHECK (source IN ('dur_api', 'ruleset')),
  updated_at  timestamptz DEFAULT now(),
  CONSTRAINT uq_interaction UNIQUE (drug_a_id, drug_b_id),
  CONSTRAINT pair_order CHECK (drug_a_id < drug_b_id)
);

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interactions_read" ON public.interactions;
CREATE POLICY "interactions_read" ON public.interactions
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- pharmacies: 약국 계정 (B2B)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid NOT NULL REFERENCES public.profiles(id),
  name                text NOT NULL,
  license_number      text,
  subscription_status text NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'expired')),
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE public.pharmacies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pharmacies_owner" ON public.pharmacies;
CREATE POLICY "pharmacies_owner" ON public.pharmacies
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- ─────────────────────────────────────────────
-- pharmacy_patients: 약국-환자 단골 관계 (QR 매핑)
-- consent_given은 014의 약사 열람 동의 게이트(pharmacist_can_view)와 별개의 관계 플래그
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_patients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id   uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  patient_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  consent_given boolean NOT NULL DEFAULT false,
  connected_at  timestamptz DEFAULT now(),
  UNIQUE (pharmacy_id, patient_id)
);

ALTER TABLE public.pharmacy_patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pharmacy_patients_patient" ON public.pharmacy_patients;
CREATE POLICY "pharmacy_patients_patient" ON public.pharmacy_patients
  FOR ALL USING (auth.uid() = patient_id) WITH CHECK (auth.uid() = patient_id);

DROP POLICY IF EXISTS "pharmacy_patients_pharmacy" ON public.pharmacy_patients;
CREATE POLICY "pharmacy_patients_pharmacy" ON public.pharmacy_patients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.pharmacies ph
      WHERE ph.id = pharmacy_patients.pharmacy_id AND ph.owner_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- prescriptions: (레거시) OCR 원본 — 002의 user_prescriptions로 대체됨.
-- user_medications.prescription_id가 원래 이 테이블을 참조했고 004가 재연결한다.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_path text NOT NULL,
  ocr_status text NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed')),
  ocr_raw    jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prescriptions_self" ON public.prescriptions;
CREATE POLICY "prescriptions_self" ON public.prescriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- user_medications: 사용자 복약 프로필 (약/건기식/직접입력 중 하나)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_medications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  drug_id         uuid REFERENCES public.drugs(id),
  supplement_id   uuid REFERENCES public.supplements(id),
  custom_name     text,
  dose            text,
  frequency       text,
  started_at      date,
  ended_at        date,
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('ocr', 'manual', 'pharmacy')),
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE SET NULL,  -- 004가 user_prescriptions로 재연결
  deleted_at      timestamptz,  -- 소프트 삭제
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT chk_med_or_supp CHECK (drug_id IS NOT NULL OR supplement_id IS NOT NULL OR custom_name IS NOT NULL)
);

ALTER TABLE public.user_medications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "medications_self" ON public.user_medications;
CREATE POLICY "medications_self" ON public.user_medications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_meds_user
  ON public.user_medications (user_id) WHERE deleted_at IS NULL;
