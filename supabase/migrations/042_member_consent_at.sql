-- 가족(제3자) 건강정보 저장 동의 시각 감사 기록 (6차 평가 P-M2)
-- 가족 추가 시 UI에서 체크하는 "본인의 동의를 받았으며..." 확인 시각을 서버가 기록.
-- 기존 행은 NULL 유지(소급 불가) — is_self=true 본인 행은 항상 NULL.
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS consent_at timestamptz;
COMMENT ON COLUMN public.members.consent_at IS '가족 추가 시 제3자 동의 확인 체크 시각 (is_self=false만 해당, 서버 기록)';
