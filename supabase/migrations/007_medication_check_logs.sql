-- 007_medication_check_logs.sql
-- 복약 체크 "이력 로그" (append-only). medication_schedules가 '현재 상태'를 담는다면,
-- 이 테이블은 체크/해제 이벤트를 매번 1행씩 쌓아 순응도(adherence) 분석·기록 조회에 쓴다.
-- (medication_schedules 006은 그대로 유지)

CREATE TABLE IF NOT EXISTS public.medication_check_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.medication_schedules(id) ON DELETE SET NULL,  -- 해당 상태행과 연결(선택)
  check_date  date NOT NULL,
  meal_time   text NOT NULL CHECK (meal_time IN ('morning','afternoon','evening')),
  is_checked  boolean NOT NULL,        -- true=복약 체크, false=해제
  logged_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_med_check_logs_user_date
  ON public.medication_check_logs(user_id, check_date);

ALTER TABLE public.medication_check_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "med_check_logs_select" ON public.medication_check_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "med_check_logs_insert" ON public.medication_check_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
