-- ─────────────────────────────────────────────
-- user_prescriptions.department: 진료과
-- ─────────────────────────────────────────────
-- 배경: 여러 의원·여러 과에서 처방받은 경우 약지갑에서 "어느 과 약"인지 구분이 안 됨.
--   처방전에서 진료과(내과·정형외과 등)를 추출해 카드에 표시하기 위함.
-- 채움: OCR(api/ocr) 추출 + 수동 입력(약 추가 폼). 없으면 null(병원명만 표시).

ALTER TABLE public.user_prescriptions ADD COLUMN IF NOT EXISTS department text;
