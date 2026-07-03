-- 044: 약사가 동의 단골 환자의 '본인(is_self)' 복약 체크 이력을 read-only로 조회.
-- 007의 본인 select/insert는 유지하고 약사 SELECT 정책만 추가.
-- 게이트: pharmacist_can_view(동의 AND 단골, 014) AND is_self_member(가족 로그 제외, 031).
-- 약사 토큰 + RLS만 — service_role 우회 없음.
drop policy if exists "mcl_pharmacist_view" on public.medication_check_logs;
create policy "mcl_pharmacist_view" on public.medication_check_logs
  for select using (
    public.pharmacist_can_view(user_id)
    and public.is_self_member(member_id)
  );
