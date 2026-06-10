-- 020_bedtime_support.sql
-- medication_schedules·medication_check_logs의 meal_time CHECK 제약에 'bedtime' 추가.
-- UI는 이미 4슬롯(자기 전 22:00)을 노출하지만 백엔드가 3끼만 허용해 체크가 400으로 조용히 소실됐다.

-- 1) medication_schedules
DO $$
DECLARE v text;
BEGIN
  SELECT conname INTO v
  FROM pg_constraint
  JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
  WHERE pg_class.relname = 'medication_schedules'
    AND pg_constraint.contype = 'c'
    AND pg_get_constraintdef(pg_constraint.oid) LIKE '%meal_time%';
  IF v IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.medication_schedules DROP CONSTRAINT %I', v);
  END IF;
END $$;

ALTER TABLE public.medication_schedules
  ADD CONSTRAINT medication_schedules_meal_time_check
  CHECK (meal_time IN ('morning','afternoon','evening','bedtime'));

-- 2) medication_check_logs
DO $$
DECLARE v text;
BEGIN
  SELECT conname INTO v
  FROM pg_constraint
  JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
  WHERE pg_class.relname = 'medication_check_logs'
    AND pg_constraint.contype = 'c'
    AND pg_get_constraintdef(pg_constraint.oid) LIKE '%meal_time%';
  IF v IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.medication_check_logs DROP CONSTRAINT %I', v);
  END IF;
END $$;

ALTER TABLE public.medication_check_logs
  ADD CONSTRAINT medication_check_logs_meal_time_check
  CHECK (meal_time IN ('morning','afternoon','evening','bedtime'));
