-- 약사뷰 가족 격리를 RLS 레벨로 이중화
--
-- 배경: 014의 약사 SELECT 정책은 pharmacist_can_view(user_id) 한 조건뿐이라,
--   030에서 도입된 가족 멤버(member_id) 약/처방까지 RLS상 약사에게 열려 있었다.
--   현재는 앱 쿼리(.eq('member_id', selfMemberId))로만 가족 약을 가리는 단일 의존 상태.
--   타인(가족·미동의 제3자) 건강정보 보호는 규제 민감 영역 → 정책 레벨로 끌어올려 이중화한다.
--
-- 계율: 약사는 환자 '본인(is_self)' 멤버의 약/처방만 조회. 가족 멤버 행은 RLS에서 비운다.

-- 행의 member_id가 is_self 멤버인지 판정. SECURITY DEFINER로 members RLS 우회(재귀 방지).
-- member_id가 null이면 false(앱 필터 .eq('member_id', selfMemberId)와 동일하게 제외).
create or replace function public.is_self_member(p_member uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.id = p_member and m.is_self = true
  );
$$;
revoke all on function public.is_self_member(uuid) from public;
grant execute on function public.is_self_member(uuid) to authenticated;

-- 약사 SELECT 정책에 is_self 멤버 조건 AND 추가 (idempotent: drop 후 생성)
drop policy if exists "medications_pharmacist_view" on public.user_medications;
create policy "medications_pharmacist_view" on public.user_medications
  for select using (
    public.pharmacist_can_view(user_id)
    and public.is_self_member(member_id)
  );

drop policy if exists "prescriptions_pharmacist_view" on public.user_prescriptions;
create policy "prescriptions_pharmacist_view" on public.user_prescriptions
  for select using (
    public.pharmacist_can_view(user_id)
    and public.is_self_member(member_id)
  );

-- 약사가 동의 환자의 '본인(is_self)' 멤버 id를 읽어 본인 약만 필터링하도록 허용.
-- 030 이후 members엔 owner 전용(members_owner_all) 정책만 있어, 약사 토큰으로는 self 멤버가
-- 0건 → selfMemberId=null → 동의 환자 복약이 전부 0종으로 표시되는 회귀가 있었음.
-- 노출 최소화: is_self 행 + pharmacist_can_view(owner) 동의 게이트만(가족 멤버 행은 제외).
drop policy if exists "members_pharmacist_view" on public.members;
create policy "members_pharmacist_view" on public.members
  for select using (
    is_self and public.pharmacist_can_view(owner_id)
  );
