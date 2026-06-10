-- 024_profile_settings.sql
-- 글자 크기·복약 알림 설정을 profiles에 서버 영속.
-- 기존에는 localStorage 전용이라 기기 변경 시 유실됐고, cron이 사용자 토글을 무시했다.
-- alarm_times 키는 lib/meal-slots.ts의 Meal 타입(morning/afternoon/evening/bedtime)과 동일.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS font_size     text    NOT NULL DEFAULT 'normal'
    CHECK (font_size IN ('normal', 'large', 'xlarge')),
  ADD COLUMN IF NOT EXISTS alarm_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alarm_times   jsonb   NOT NULL
    DEFAULT '{"morning": true, "afternoon": true, "evening": true, "bedtime": true}';
