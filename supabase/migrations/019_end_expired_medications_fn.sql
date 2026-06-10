-- 만료 처방 약 자동 종료 함수
-- 처방일 + 투약일수가 지난 user_medications의 ended_at을 자동 세팅
-- cron(medication-reminders, morning 끼니)에서 매일 1회 호출
CREATE OR REPLACE FUNCTION end_expired_medications(today date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_medications m
  SET ended_at = NOW()
  FROM user_prescriptions p
  WHERE m.prescription_id = p.id
    AND m.ended_at IS NULL
    AND m.deleted_at IS NULL
    AND p.prescribed_at IS NOT NULL
    AND p.duration_days IS NOT NULL
    AND (p.prescribed_at::date + p.duration_days) < today;
END;
$$;
