-- 058: 알림 발송 영수증.
--
-- 9차 평가가 "리필 리마인더가 10주간 한 번도 발송된 적 없다" 고 지적했을 때, 그것이
--   (a) cron 이 안 돌았다  (b) 돌았는데 대상이 없었다  (c) 돌았고 대상도 있었는데 실패했다
-- 중 무엇인지 **구분할 방법이 없었다.** 10차에서 pg_stat_statements 로 호출 횟수를 역추적해서야
-- (b) 로 확정했는데, 그건 진단이지 운영 수단이 아니다. 매번 그렇게 캘 수는 없다.
--
-- 그래서 실행마다 영수증을 남긴다. 행이 없으면 안 돈 것이고, 행이 있는데 sent=0 이면
-- 보낼 사람이 없었던 것이고, failed>0 이면 보내려다 실패한 것이다. 셋이 서로 구분된다.
--
-- 개인 식별 정보는 담지 않는다 — 누구에게 보냈는지가 아니라 **몇 건이 어떻게 됐는지**만 남긴다.
-- 알림 내용도 담지 않는다(복약 정보다).

create table if not exists public.notification_runs (
  id          uuid        primary key default gen_random_uuid(),
  kind        text        not null check (kind in ('meal', 'refill')),
  run_date    date        not null,                    -- KST 기준 실행일
  slot        text,                                    -- meal 일 때 끼니(morning/afternoon/evening/bedtime)
  targets     int         not null default 0,          -- 발송 대상으로 추린 수
  sent        int         not null default 0,          -- 실제 전송 성공 건수
  failed      int         not null default 0,          -- 전송 시도 중 실패(만료 구독 등)
  note        text,                                    -- 조기 종료 사유 등(예: '구독자 없음')
  created_at  timestamptz not null default now()
);

create index if not exists idx_notification_runs_kind_date
  on public.notification_runs (kind, run_date desc, created_at desc);

alter table public.notification_runs enable row level security;

-- 정책을 만들지 않는다 → anon·authenticated 모두 접근 불가. cron 은 service_role 로 쓴다.
-- (RLS 를 켜고 정책이 없으면 service_role 만 통과한다 — 054 의 insert-only 와 같은 방식.)

comment on table public.notification_runs is
  '복약·리필 알림 cron 실행 영수증. "안 보냈다" 와 "보냈는데 실패" 를 구분하기 위한 최소 기록. 개인정보·알림 내용 미포함.';
