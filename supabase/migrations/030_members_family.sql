-- ─────────────────────────────────────────────
-- members: 경량 가족 멤버 (한 계정이 여러 가족의 약을 멤버별로 관리)
-- ─────────────────────────────────────────────
-- 배경: 부모님 등 가족 약을 한 계정에서 관리. 별도 로그인/초대 없이 owner 계정 아래
--   '본인/어머니/…' 멤버 버킷으로 분리. 약·처방·끼니체크가 멤버별로 독립된다.
-- ⚠️ 규제: 타인(가족) 건강정보를 한 계정에 보관 → 성인 가족은 동의 전제, 보호 대상은
--   보호자 관리 고지 필요(앱 문구로 안내). 약사 공개(consent)는 멤버별 분리 검토(차후).

CREATE TABLE IF NOT EXISTS public.members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  relation   text,
  is_self    boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS members_owner_all ON public.members;
CREATE POLICY members_owner_all ON public.members
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_members_owner ON public.members(owner_id);

-- 기존 사용자마다 '본인' 멤버 1개 백필
INSERT INTO public.members (owner_id, name, relation, is_self)
SELECT p.id, COALESCE(NULLIF(p.full_name, ''), '본인'), '본인', true
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.members m WHERE m.owner_id = p.id AND m.is_self);

-- member_id 컬럼 (약·처방·스케줄·체크로그) + 기존 행 본인 멤버로 백필
ALTER TABLE public.user_medications      ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.members(id) ON DELETE CASCADE;
ALTER TABLE public.user_prescriptions    ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.members(id) ON DELETE CASCADE;
ALTER TABLE public.medication_schedules  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.members(id) ON DELETE CASCADE;
ALTER TABLE public.medication_check_logs ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.members(id) ON DELETE CASCADE;

UPDATE public.user_medications      t SET member_id = m.id FROM public.members m WHERE m.owner_id = t.user_id AND m.is_self AND t.member_id IS NULL;
UPDATE public.user_prescriptions    t SET member_id = m.id FROM public.members m WHERE m.owner_id = t.user_id AND m.is_self AND t.member_id IS NULL;
UPDATE public.medication_schedules  t SET member_id = m.id FROM public.members m WHERE m.owner_id = t.user_id AND m.is_self AND t.member_id IS NULL;
UPDATE public.medication_check_logs t SET member_id = m.id FROM public.members m WHERE m.owner_id = t.user_id AND m.is_self AND t.member_id IS NULL;

-- 끼니 체크 유니크키에 member_id 포함 (멤버별 독립 체크)
ALTER TABLE public.medication_schedules DROP CONSTRAINT IF EXISTS medication_schedules_user_id_check_date_meal_time_key;
ALTER TABLE public.medication_schedules ADD CONSTRAINT medication_schedules_user_member_date_meal_key UNIQUE (user_id, member_id, check_date, meal_time);
