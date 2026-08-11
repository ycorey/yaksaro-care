-- 055_ter_request_notify.sql
-- 「약사로 터」 신청이 들어오면 운영 메일로 알린다.
--   ter_requests INSERT → 이 트리거 → pg_net(비동기 큐) → Edge Function `ter-notify` → Zoho SMTP
--
-- 왜 트리거인가: 신청 저장은 랜딩의 익명 insert 로 이미 검증돼 있다(054).
-- 클라이언트가 메일 발송까지 호출하게 두면 발송이 브라우저 사정에 좌우되므로, DB 쪽에 건다.
--
-- 헤더에 넣는 키는 **anon 키**다. 랜딩 HTML 에 이미 공개돼 있는 키라 여기 적어도 새로 노출되는 것이 없다.
-- 위조 방지는 함수 쪽에서 한다 — 본문의 id 를 믿지 않고 service_role 로 행을 다시 읽어
-- 존재 여부와 신선도(5분)를 확인한 뒤에만 메일을 보낸다.

create extension if not exists pg_net;

create or replace function public.notify_ter_request()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
begin
  -- net.http_post 는 요청을 큐에 넣고 즉시 반환한다(INSERT 를 붙잡지 않는다).
  perform net.http_post(
    url     := 'https://tjtugyoexwsqaquheega.supabase.co/functions/v1/ter-notify',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdHVneW9leHdzcWFxdWhlZWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTk0MTAsImV4cCI6MjA5NTc3NTQxMH0.oZw5P8Mzr1k1yDylQIptp1Qaic-BJOOvyogfBkkUyZc'
    ),
    body    := jsonb_build_object('id', new.id),
    -- SMTP 왕복이 5초를 넘는다(실측 5.5초). 기본값 5000 이면 발송은 성공하는데
    -- pg_net 이 먼저 끊어 net._http_response 에 타임아웃으로만 남아 진단이 어긋난다.
    timeout_milliseconds := 25000
  );
  return null;   -- AFTER 트리거라도 plpgsql 은 RETURN 이 없으면 2F005 로 죽는다(= INSERT 실패)
exception when others then
  -- 알림이 깨져도 신청은 반드시 남아야 한다. 실패는 경고만 남기고 삼킨다.
  raise warning 'ter notify failed for %: %', new.id, sqlerrm;
  return null;
end;
$$;

comment on function public.notify_ter_request is '약사로 터 신청 알림 — ter-notify Edge Function 호출(실패해도 INSERT 는 성공)';

drop trigger if exists ter_requests_notify on public.ter_requests;
create trigger ter_requests_notify
  after insert on public.ter_requests
  for each row execute function public.notify_ter_request();

-- 트리거 함수는 security definer 다. anon 이 직접 호출할 이유가 없으므로 실행 권한을 회수한다.
-- PUBLIC 회수가 먼저다 — 새 함수에는 기본으로 PUBLIC EXECUTE 가 붙어서,
-- anon/authenticated 만 회수하면 /rest/v1/rpc/notify_ter_request 노출이 그대로 남는다(어드바이저 0028/0029).
revoke all on function public.notify_ter_request() from public;
revoke all on function public.notify_ter_request() from anon, authenticated;
