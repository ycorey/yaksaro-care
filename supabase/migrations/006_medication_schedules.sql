-- 006_medication_schedules.sql
-- 매일 복약 체크(아침/점심/저녁) 상태를 서버에 영속화하는 초경량 스냅샷 테이블.
-- 기존에는 localStorage에만 저장돼 기기 변경/재설치 시 기록이 소실됐다.

CREATE TABLE IF NOT EXISTS public.medication_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prescription_id uuid REFERENCES public.user_prescriptions(id) ON DELETE SET NULL,  -- 향후 처방전별 추적용(현재 일일 체크는 null)
  check_date      date NOT NULL,
  meal_time       text NOT NULL CHECK (meal_time IN ('morning','afternoon','evening')),
  is_checked      boolean NOT NULL DEFAULT false,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, check_date, meal_time)
);

CREATE INDEX IF NOT EXISTS idx_med_sched_user_date
  ON public.medication_schedules(user_id, check_date);

ALTER TABLE public.medication_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "med_sched_select" ON public.medication_schedules
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "med_sched_insert" ON public.medication_schedules
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "med_sched_update" ON public.medication_schedules
  FOR UPDATE USING (auth.uid() = user_id);
