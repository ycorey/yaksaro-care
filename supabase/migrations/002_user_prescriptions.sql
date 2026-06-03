-- 디지털 약 지갑: 처방전 원본 데이터 (이미지 파기 후 텍스트만 보존)
CREATE TABLE IF NOT EXISTS user_prescriptions (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_medicine_list JSONB   NOT NULL DEFAULT '[]',  -- ["타이레놀", "아스피린", ...]
  prescribed_at     DATE,
  duration_days     INTEGER,
  pharmacy_name     TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_prescriptions_select" ON user_prescriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_prescriptions_insert" ON user_prescriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_prescriptions_delete" ON user_prescriptions
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_user_prescriptions_user_id ON user_prescriptions(user_id);
