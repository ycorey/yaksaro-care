-- 061: /ter 신청의 보유기간을 강제한다.
--
-- 방침 제2조와 신청 폼이 모두 "리포트 회신 완료 후 1년" 을 약속하는데,
-- 054~059 어디에도 **지우는 장치가 없었다.** 파기는 운영자가 대시보드에서 손으로 지워야만 했고,
-- 손으로 하는 일은 결국 안 한다(059 가 status_at 을 자동화한 것과 같은 이유다).
--
-- 더 나쁜 것은 **기산점이 없었다는 점**이다. 059 의 status_at 은 "마지막으로 상태가 바뀐 시각" 이라
-- done 이후 dropped 로 한 번만 더 바꾸면 회신일이 덮어써진다. 1년을 세려 해도 셀 수가 없다.
-- 그래서 회신 시각을 별도 컬럼에 **한 번만** 박는다.
--
-- 파기 대상 기준(코드와 방침을 일치시킨다):
--   회신한 건   → replied_at + 1년
--   취소·중복   → status_at  + 1년
--   회신 못 한 건 → created_at + 1년   ← 방침이 명시하지 않던 구멍. 접수일 기준으로 함께 지운다.
-- 즉 coalesce(replied_at, status_at, created_at) 하나로 모든 행에 기산점이 생긴다.

alter table public.ter_requests
  add column if not exists replied_at timestamptz;

comment on column public.ter_requests.replied_at is
  '리포트 회신을 완료한 시각. status 가 done 으로 바뀔 때 한 번만 기록되며 이후 상태가 바뀌어도 유지된다. 보유기간(1년) 기산점.';

-- 이미 done 인 행에 기산점을 소급해 준다. 059 배포 이후의 status_at 이 사실상 회신 시각이다.
update public.ter_requests
   set replied_at = coalesce(status_at, created_at)
 where status = 'done' and replied_at is null;

-- 059 의 트리거를 확장한다. replied_at 은 **비어 있을 때만** 채운다 —
-- done → dropped → done 처럼 오가도 최초 회신일이 밀리지 않아야 1년 계산이 안정된다.
create or replace function public.ter_requests_touch_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.status_at := now();
    if new.status = 'done' and new.replied_at is null then
      new.replied_at := now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.ter_requests_touch_status() from public, anon, authenticated;

-- 파기 대상을 뽑는 질의용. 행 수가 적어도 cron 이 매일 도는 질의라 인덱스를 둔다.
create index if not exists idx_ter_requests_retention
  on public.ter_requests ((coalesce(replied_at, status_at, created_at)));

-- ── 파기 영수증 ──────────────────────────────────────────────────────────────
-- 058 이 알림 cron 에 대해 세운 원칙("행이 없으면 안 돈 것, 행이 있는데 0 이면 대상이 없던 것")을
-- 파기에도 그대로 적용한다. 파기는 되돌릴 수 없으므로 오히려 알림보다 기록이 더 필요하다.
-- 개인정보는 담지 않는다 — 누구를 지웠는지가 아니라 **몇 건을 지웠는지**만 남긴다.
alter table public.notification_runs
  drop constraint if exists notification_runs_kind_check;
alter table public.notification_runs
  add constraint notification_runs_kind_check
  check (kind in ('meal', 'refill', 'ter_purge'));

comment on table public.notification_runs is
  '정기 cron 실행 영수증(복약·리필 알림, /ter 신청 파기). "안 돌았다" 와 "돌았는데 대상 0" 과 "실패" 를 구분하기 위한 최소 기록. 개인정보·알림 내용 미포함.';
