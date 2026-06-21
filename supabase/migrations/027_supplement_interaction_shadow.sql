-- 건기식·식품-약물 상호작용: 캐시 + shadow 로그
-- PoC(interaction-poc/)에서 검증한 매칭 게이트를 앱에 shadow로 붙인다(환자 비노출, DUR shadow와 동일 패턴).
-- 상호작용 쌍은 거의 불변 → 결과를 캐시해 MedData 무료 250콜/월을 아낀다.

-- 1) 상호작용 결과 캐시 (key = 정규화 전 입력 소문자). service_role(admin)만 접근.
CREATE TABLE IF NOT EXISTS supplement_interaction_cache (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplement_input  TEXT NOT NULL,
  drug_input        TEXT NOT NULL,
  status            TEXT NOT NULL,            -- AnalyzeStatus(INTERACTION_FOUND 등)
  interaction_count INTEGER NOT NULL DEFAULT 0,
  result            JSONB NOT NULL,           -- 전체 AnalyzeResult
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (supplement_input, drug_input)
);

ALTER TABLE supplement_interaction_cache ENABLE ROW LEVEL SECURITY;
-- 정책 없음 → 일반 사용자 접근 불가. admin client(service_role)만 RLS 우회로 읽고 쓴다.

-- 2) shadow 로그 (환자 비노출 — 한글↔영문 정규화/매칭 갭을 실측). DUR shadow와 동일 권한 모델.
CREATE TABLE IF NOT EXISTS supplement_interaction_shadow_logs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ocr_session_id              UUID,
  drug_count                  INTEGER NOT NULL DEFAULT 0,   -- 지갑 약물 수(유니크)
  supplement_count            INTEGER NOT NULL DEFAULT 0,   -- 지갑 건기식 수(유니크)
  pair_count                  INTEGER NOT NULL DEFAULT 0,   -- MedData 도달 페어 수
  supplement_normalized_count INTEGER NOT NULL DEFAULT 0,   -- 건기식 사전 매칭 성공(유니크)
  drug_normalized_count       INTEGER NOT NULL DEFAULT 0,   -- 약물 RxNorm 매칭 성공(유니크)
  meddata_called_count        INTEGER NOT NULL DEFAULT 0,   -- 실제 MedData 호출(캐시 미스)
  cache_hit_count             INTEGER NOT NULL DEFAULT 0,
  interaction_found_count     INTEGER NOT NULL DEFAULT 0,   -- 매칭된 상호작용 쌍 수
  severity_summary            JSONB,
  created_at                  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE supplement_interaction_shadow_logs ENABLE ROW LEVEL SECURITY;

-- 본인 로그만 조회 가능. INSERT는 service_role(admin client)만.
CREATE POLICY "supp_shadow_logs_select" ON supplement_interaction_shadow_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_supp_shadow_user ON supplement_interaction_shadow_logs(user_id);
