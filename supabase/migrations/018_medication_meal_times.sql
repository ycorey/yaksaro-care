-- 약별 복용 시간대 (예: '{morning,evening}')
ALTER TABLE user_medications
  ADD COLUMN IF NOT EXISTS meal_times text[] DEFAULT '{}';
