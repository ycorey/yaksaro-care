-- 057: /ter 공개 신청 폼에 남용 방어.
--
-- 054 의 ter_requests 는 익명(anon) INSERT 를 무제한 허용하고, 055 의 트리거가 **행마다**
-- ter-notify(Gmail SMTP)를 호출한다. 즉 **INSERT 한 번 = 메일 한 통**이다.
-- 랜딩은 정적 HTML 이라 PostgREST 로 직접 넣는 구조여서 앱 계층에서 막을 자리가 없다.
-- 봇이 한 번 훑으면 메일이 폭주하고, 그 결과로 Gmail 앱 비밀번호가 차단되면
-- **알림 경로 자체가 죽는다**(신청은 계속 쌓이는데 아무도 모르는 상태 — 오늘 내내 다룬 그 유형).
--
-- 그래서 DB 에서 막는다. 익명 요청이라 IP·세션을 알 수 없으므로 다음 두 가지로 좁힌다.
--   1) 같은 이메일 하루 3건 — 한 사람이 여러 자리를 신청하는 정상 사용은 남긴다(054 주석 참조)
--   2) 전체 시간당 20건 — 사람이 만드는 트래픽으로는 닿기 어렵고, 봇은 즉시 걸린다
-- 실제 유입은 현재 1건 수준이라 정상 사용자가 이 벽에 닿을 일은 없다.

create or replace function public.ter_requests_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  per_email int;
  per_hour  int;
begin
  -- SECURITY DEFINER 인 이유: RLS 는 anon 에게 SELECT 를 주지 않는다(054 는 insert-only).
  -- 정의자 권한이 아니면 트리거가 자기 테이블을 세지 못한다.
  select count(*) into per_email
    from public.ter_requests
   where lower(email) = lower(new.email)
     and created_at > now() - interval '1 day';

  if per_email >= 3 then
    raise exception '같은 이메일로는 하루 3건까지 신청할 수 있어요.'
      using errcode = 'check_violation';
  end if;

  select count(*) into per_hour
    from public.ter_requests
   where created_at > now() - interval '1 hour';

  if per_hour >= 20 then
    raise exception '신청이 일시적으로 몰리고 있어요. 잠시 후 다시 시도해주세요.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- 정의자 함수는 호출 가능성을 최소화한다(046 의 교훈). 트리거 실행은 EXECUTE 를 검사하지 않으므로
-- 회수해도 트리거는 정상 동작한다.
revoke all on function public.ter_requests_rate_limit() from public, anon, authenticated;

drop trigger if exists ter_requests_rate_limit on public.ter_requests;
create trigger ter_requests_rate_limit
  before insert on public.ter_requests
  for each row execute function public.ter_requests_rate_limit();

-- 카운트 두 개가 매 INSERT 마다 도므로 인덱스를 준다.
create index if not exists idx_ter_requests_email_created
  on public.ter_requests (lower(email), created_at desc);

comment on function public.ter_requests_rate_limit() is
  '공개 신청 폼 남용 방어. INSERT 1건 = 알림 메일 1통이라, 메일 폭주로 발송 계정이 차단되는 것을 막는다.';
