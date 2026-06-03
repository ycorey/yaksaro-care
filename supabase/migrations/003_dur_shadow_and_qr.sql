-- DUR Shadow Logging 테이블
CREATE TABLE IF NOT EXISTS dur_shadow_logs (
  id                UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID     REFERENCES auth.users(id) ON DELETE CASCADE,
  ocr_session_id    UUID,
  drug_ids          UUID[]   NOT NULL,
  matched_count     INTEGER  NOT NULL DEFAULT 0,
  interaction_count INTEGER  NOT NULL DEFAULT 0,
  severity_summary  JSONB,   -- {"contraindicated":N,"warning":N}
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE dur_shadow_logs ENABLE ROW LEVEL SECURITY;

-- 본인 로그만 조회 가능, INSERT는 service_role(API Route admin client)
CREATE POLICY "dur_shadow_logs_select" ON dur_shadow_logs
  FOR SELECT USING (auth.uid() = user_id);

-- QR 매핑: pharmacies에 store_id 추가
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS store_id TEXT UNIQUE;

-- 단골 약국: profiles에 regular_pharmacy_id 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS regular_pharmacy_id UUID REFERENCES pharmacies(id) ON DELETE SET NULL;
