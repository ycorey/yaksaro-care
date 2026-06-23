-- 리필·재방문 푸시 중복 방지: 처방전당 1회만 알림. 재처방=새 행이라 자동 리셋.
alter table public.user_prescriptions
  add column if not exists refill_reminded_at timestamptz;
