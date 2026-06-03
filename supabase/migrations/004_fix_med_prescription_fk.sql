-- 004_fix_med_prescription_fk.sql
-- user_medications.prescription_id 가 옛 prescriptions 테이블을 참조하던 것을
-- OCR이 실제로 저장하는 user_prescriptions 테이블로 재연결한다.
-- (FK 이름이 기본명 user_medications_prescription_id_fkey 이므로 이름으로 drop 후 재생성)

ALTER TABLE public.user_medications
  DROP CONSTRAINT IF EXISTS user_medications_prescription_id_fkey;

ALTER TABLE public.user_medications
  ADD CONSTRAINT user_medications_prescription_id_fkey
  FOREIGN KEY (prescription_id)
  REFERENCES public.user_prescriptions(id)
  ON DELETE SET NULL;
