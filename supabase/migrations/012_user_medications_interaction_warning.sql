-- 012_user_medications_interaction_warning.sql
-- OTC 일반약 등록 시 처방약과의 DUR 상호작용 감지 결과를 저장하는 플래그

ALTER TABLE public.user_medications
  ADD COLUMN IF NOT EXISTS has_interaction_warning BOOLEAN DEFAULT false;
