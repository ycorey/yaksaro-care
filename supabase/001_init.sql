-- 약사로 케어 초기 스키마 마이그레이션
-- Supabase SQL Editor에 붙여넣어 실행하세요

-- ────────────────────────────────────────────
-- 1. profiles (auth.users 확장)
-- ────────────────────────────────────────────
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text,
  role            text not null default 'patient' check (role in ('patient', 'pharmacist')),
  phone           text,
  consent_health  boolean not null default false,   -- 민감정보 동의 (개보법 §23)
  consent_health_at timestamptz,
  created_at      timestamptz default now()
);

-- auth.users 생성 시 자동으로 profiles 행 삽입
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
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
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────
-- 2. drugs (식약처 의약품 마스터 — ETL 미러)
-- ────────────────────────────────────────────
create table if not exists public.drugs (
  id               uuid primary key default gen_random_uuid(),
  item_seq         text unique not null,  -- 식약처 품목코드
  item_name        text not null,
  entp_name        text,                  -- 제조사
  ingredient_name  text,                  -- 주성분명
  ingredient_code  text,                  -- 성분코드 (DUR 매칭)
  etc_otc_name     text,                  -- 전문/일반
  chart            text,                  -- 성상
  form_code_name   text,
  updated_at       timestamptz default now()
);

create index if not exists idx_drugs_item_name on public.drugs using gin(item_name gin_trgm_ops);
create index if not exists idx_drugs_ingredient_code on public.drugs(ingredient_code);

-- ────────────────────────────────────────────
-- 3. supplements (건기식 마스터 — ETL 미러)
-- ────────────────────────────────────────────
create table if not exists public.supplements (
  id              uuid primary key default gen_random_uuid(),
  product_seq     text unique not null,
  product_name    text not null,
  company_name    text,
  main_function   text,
  caution         text,
  updated_at      timestamptz default now()
);

create index if not exists idx_supplements_name on public.supplements using gin(product_name gin_trgm_ops);

-- ────────────────────────────────────────────
-- 4. prescriptions (처방전 OCR 원본)
-- ────────────────────────────────────────────
create table if not exists public.prescriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  image_path  text not null,  -- Supabase Storage private 경로
  ocr_status  text not null default 'pending' check (ocr_status in ('pending','processing','completed','failed')),
  ocr_raw     jsonb,           -- GPT-4o Vision 원본 응답
  created_at  timestamptz default now()
);

-- ────────────────────────────────────────────
-- 5. user_medications (복약 프로필 핵심)
-- ────────────────────────────────────────────
create table if not exists public.user_medications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  drug_id         uuid references public.drugs(id),
  supplement_id   uuid references public.supplements(id),
  custom_name     text,         -- OCR 미매칭 수동 입력
  dose            text,
  frequency       text,
  started_at      date,
  ended_at        date,         -- null = 현재 복용 중
  source          text not null default 'manual' check (source in ('ocr','manual','pharmacy')),
  prescription_id uuid references public.prescriptions(id),
  deleted_at      timestamptz,  -- soft delete
  created_at      timestamptz default now(),
  constraint chk_med_or_supp check (
    drug_id is not null or supplement_id is not null or custom_name is not null
  )
);

create index if not exists idx_user_meds_user on public.user_medications(user_id) where deleted_at is null;

-- ────────────────────────────────────────────
-- 6. interactions (DUR 상호작용 캐시)
-- ────────────────────────────────────────────
create table if not exists public.interactions (
  id          uuid primary key default gen_random_uuid(),
  drug_a_id   uuid not null references public.drugs(id),
  drug_b_id   uuid not null references public.drugs(id),
  severity    text not null check (severity in ('contraindicated','warning','monitor','ok')),
  description text,
  source      text not null default 'dur_api' check (source in ('dur_api','ruleset')),
  updated_at  timestamptz default now(),
  constraint pair_order check (drug_a_id < drug_b_id),
  constraint uq_interaction unique (drug_a_id, drug_b_id)
);

create index if not exists idx_interactions_drugs on public.interactions(drug_a_id, drug_b_id);

-- ────────────────────────────────────────────
-- 7. pharmacies (B2B 약국)
-- ────────────────────────────────────────────
create table if not exists public.pharmacies (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id),
  name                text not null,
  license_number      text,
  address             text,
  phone               text,
  subscription_status text not null default 'trial' check (subscription_status in ('trial','active','expired')),
  created_at          timestamptz default now()
);

-- ────────────────────────────────────────────
-- 8. pharmacy_patients (약국-환자 연결)
-- ────────────────────────────────────────────
create table if not exists public.pharmacy_patients (
  id           uuid primary key default gen_random_uuid(),
  pharmacy_id  uuid not null references public.pharmacies(id) on delete cascade,
  patient_id   uuid not null references public.profiles(id) on delete cascade,
  consent_given boolean not null default false,  -- 환자 동의 필수
  connected_at timestamptz default now(),
  unique(pharmacy_id, patient_id)
);

-- ────────────────────────────────────────────
-- 9. RLS (Row Level Security) 정책
-- ────────────────────────────────────────────
alter table public.profiles          enable row level security;
alter table public.drugs             enable row level security;
alter table public.supplements       enable row level security;
alter table public.prescriptions     enable row level security;
alter table public.user_medications  enable row level security;
alter table public.interactions      enable row level security;
alter table public.pharmacies        enable row level security;
alter table public.pharmacy_patients enable row level security;

-- profiles: 본인만 읽기/쓰기
create policy "profiles_self" on public.profiles
  using (auth.uid() = id) with check (auth.uid() = id);

-- drugs/supplements/interactions: 인증 사용자 읽기 (쓰기는 service_role 배치만)
create policy "drugs_read" on public.drugs for select using (auth.role() = 'authenticated');
create policy "supplements_read" on public.supplements for select using (auth.role() = 'authenticated');
create policy "interactions_read" on public.interactions for select using (auth.role() = 'authenticated');

-- prescriptions: 본인만
create policy "prescriptions_self" on public.prescriptions
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- user_medications: 본인 + 동의한 약사
create policy "medications_self" on public.user_medications
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "medications_pharmacist" on public.user_medications for select
  using (
    exists (
      select 1 from public.pharmacy_patients pp
      join public.pharmacies ph on ph.id = pp.pharmacy_id
      where pp.patient_id = user_medications.user_id
        and ph.owner_id = auth.uid()
        and pp.consent_given = true
    )
  );

-- pharmacies: 약국 오너 + 연결된 약사
create policy "pharmacies_owner" on public.pharmacies
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- pharmacy_patients: 환자 본인 + 약국 오너
create policy "pharmacy_patients_patient" on public.pharmacy_patients
  using (auth.uid() = patient_id) with check (auth.uid() = patient_id);

create policy "pharmacy_patients_pharmacy" on public.pharmacy_patients for select
  using (
    exists (
      select 1 from public.pharmacies ph
      where ph.id = pharmacy_patients.pharmacy_id and ph.owner_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────
-- 10. pg_trgm 확장 (퍼지 약품명 검색)
-- ────────────────────────────────────────────
create extension if not exists pg_trgm;
