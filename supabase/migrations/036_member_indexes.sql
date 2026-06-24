-- 036: 가족 멤버(030) 도입 후 member_id가 핫 필터(약지갑·홈·리필·생활정보·약사뷰·cron)에서
-- where 조건으로 자주 쓰이나 인덱스가 없었음. 성능 기준("자주 where/join FK에 인덱스") 적용.
-- nullable 컬럼이므로 partial index(member_id IS NOT NULL).

CREATE INDEX IF NOT EXISTS idx_user_meds_member
  ON public.user_medications(member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_prescriptions_member
  ON public.user_prescriptions(member_id)
  WHERE member_id IS NOT NULL;

-- 한 소유자당 self 멤버는 1개여야 함(앱은 보장하나 raw 토큰 쓰기 방어).
CREATE UNIQUE INDEX IF NOT EXISTS uq_members_one_self
  ON public.members(owner_id)
  WHERE is_self;
