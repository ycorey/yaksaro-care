-- 074: 이메일 로그인 시도 카운터 — Server Action 레이트리밋의 저장소.
--
-- 왜: `/login` 의 이메일·비밀번호 입구(login/actions.ts)에 시도 제한이 없었다(12차 평가, 3회차 이월).
--   이메일 계정은 운영팀이 발급하는 소수(스토어 심사자·소셜 불가 사용자)라 대상이 좁고, 그래서
--   더 뚫기 쉽다. Supabase Auth 의 IP 당 기본 한도는 있지만 (IP, 이메일) 조합 단위는 없다.
--
-- 왜 047 의 api_quota 를 재사용하지 않나: user_id 가 auth.users FK 다. 로그인은 사용자가 정해지기
--   **전**이라 넣을 uuid 가 없다. 그래서 텍스트 키 카운터를 따로 둔다 — 함수 꼴은 047 과 같다.
--
-- 키는 서버가 만든 sha256(ip|email) / sha256(ip) 다 — IP·이메일 원문은 저장하지 않는다
--   (src/lib/login-rate-limit.ts). 한도 비교는 서버 코드가 하고 함수는 카운트만 돌려준다
--   (047 과 같은 이유: 한도를 인자로 받지 않아 인자 조작으로 우회할 수 없다).
--
-- 권한: 047·073 과 같은 꼴 — RLS 켜고 정책 0개(사용자 토큰 전면 차단), 함수는 service_role 전용.
-- 적용: Supabase SQL Editor (073 과 같은 배치로). 적용 전에는 서버 코드가 fail-open 으로 통과시킨다
--       (계측 실패 = 로그인 막힘이 되지 않게; 로그에 'login-rate' 경고가 남는다).

create table if not exists public.login_attempts (
  key          text        not null,   -- 'ipmail:<sha256>' | 'ip:<sha256>' — 원문 없음
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (key, window_start)
);

alter table public.login_attempts enable row level security;
revoke all on table public.login_attempts from anon, authenticated;
grant all on table public.login_attempts to service_role;

create or replace function public.consume_login_attempt(
  p_key        text,
  p_window_sec integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz;
  c integer;
begin
  if p_key is null or p_key = '' or p_window_sec is null or p_window_sec < 1 then
    return 0;   -- 잘못된 호출은 계측하지 않는다(기능을 막지도 않는다)
  end if;

  -- 고정 윈도우 경계로 내림
  w := to_timestamp(floor(extract(epoch from now()) / p_window_sec) * p_window_sec);

  insert into public.login_attempts as q (key, window_start, count)
  values (p_key, w, 1)
  on conflict (key, window_start)
  do update set count = q.count + 1
  returning q.count into c;

  -- 이 키의 지난 윈도우 정리(키당 1행 유지) + 하루 넘은 남의 키도 함께 — 키가 IP 마다 생기므로
  -- 자기 것만 지우면 표가 천천히 자란다. 표가 작아 범위 스캔 비용은 무시할 수 있다.
  delete from public.login_attempts
   where (key = p_key and window_start < w)
      or window_start < now() - interval '1 day';

  return c;
end;
$$;

revoke all on function public.consume_login_attempt(text, integer) from public, anon, authenticated;
grant execute on function public.consume_login_attempt(text, integer) to service_role;
