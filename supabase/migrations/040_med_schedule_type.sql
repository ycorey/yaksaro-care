-- ─────────────────────────────────────────────
-- user_medications: 복용 방식(스케줄 타입) — 임상 스케줄 프리셋(가벼운 버전)
-- ─────────────────────────────────────────────
-- daily(기본)  : 매일 끼니 단위 (기존 동작 그대로)
-- prn          : 필요시 복용 — 알림·오늘복약 슬롯에서 제외, 약지갑에만 표시
-- weekly       : 지정 요일에만 (GLP-1 주1회 등) — dow에 요일 저장
-- (항생제 자동만료는 기존 end_expired_medications RPC가 이미 처리)

ALTER TABLE public.user_medications
  ADD COLUMN IF NOT EXISTS schedule_type text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS dow smallint[];   -- weekly 요일 (0=일요일 ~ 6=토요일)

-- 허용 타입만
ALTER TABLE public.user_medications
  DROP CONSTRAINT IF EXISTS user_medications_schedule_type_check;
ALTER TABLE public.user_medications
  ADD CONSTRAINT user_medications_schedule_type_check
  CHECK (schedule_type IN ('daily', 'prn', 'weekly'));
