-- 063: 알림을 보냈다는 사실을 행에 기록한다 — 1행 = 1통.
--
-- 057 의 rate limit 은 **INSERT** 만 센다. 그런데 알림은 Edge Function(ter-notify) 호출로 나가고,
-- 그 함수에는 호출 횟수 제한도 중복 발송 방지도 없었다. 자기 행의 id 를 아는 사람이
-- 5분(MAX_AGE_SEC) 안에 같은 id 로 반복 호출하면 메일이 그만큼 나간다.
-- 057 주석이 "Gmail 앱 비밀번호가 차단되면 알림 경로 자체가 죽는다" 고 경고한 바로 그 실패 모드다.
--
-- 호출 쪽에 카운터를 두는 대신 **행에 도장을 찍는다.** 상태가 데이터에 있으면
-- 함수가 재시작하든 동시에 두 번 뜨든 결론이 같다.
--
-- 겸해서 이 컬럼은 "알림이 실제로 나갔는가" 를 사후에 확인할 수 있는 유일한 흔적이기도 하다.
-- 지금까지는 pg_net 의 응답 로그와 Edge 로그를 대조해야만 알 수 있었다(그나마 보존기간이 짧다).
-- created_at 은 있는데 notified_at 이 오래 비어 있는 행 = 알림이 실패한 신청이다.

alter table public.ter_requests
  add column if not exists notified_at timestamptz;

comment on column public.ter_requests.notified_at is
  '운영 알림 메일을 발송한 시각. ter-notify 가 발송 성공 후 기록하며, 값이 있으면 재호출해도 다시 보내지 않는다. 비어 있는 채 오래된 행은 알림 실패를 뜻한다.';

-- 미발송 감시 질의용(cron 이 매일 훑는다).
create index if not exists idx_ter_requests_unnotified
  on public.ter_requests (created_at)
  where notified_at is null;
