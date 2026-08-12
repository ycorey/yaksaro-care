-- 060: DUR shadow 로그에 멤버 스코프.
--
-- 4차 평가부터 이월된 지적("dur-shadow member 미분리")의 실체는 로깅 정확도가 아니라
-- **경고를 쓰는 범위가 사용자 전체였다**는 것이다.
--
-- 상호작용 계산은 한 처방(=한 멤버)의 약들만 보는데, 그 결과인 has_interaction_warning 은
-- `user_id` 만으로 갱신했다. 그래서 어머니 처방을 추가하면 **본인이 복용 중인 같은 약에도**
-- 경고가 붙었다 — 함께 복용하지 않는 약인데도. 계산 범위와 기록 범위가 어긋나 있었다.
-- (코드 쪽은 applyMemberScope SSOT 로 수정했다.)
--
-- 로그에도 멤버를 남겨야 "누구의 조합에서 나온 신호인가" 를 나중에 되짚을 수 있다.
-- shadow 로그는 진단용이므로 기존 행은 null 로 둔다 — 소급해 추정하면 그 자체가 거짓 데이터가 된다.

alter table public.dur_shadow_logs
  add column if not exists member_id uuid references public.members(id) on delete set null;

create index if not exists idx_dur_shadow_logs_member
  on public.dur_shadow_logs (member_id)
  where member_id is not null;

comment on column public.dur_shadow_logs.member_id is
  '상호작용을 계산한 대상 멤버. null 은 멤버 스코프 도입(2026-08-12) 이전 로그.';
