-- 049: 가입 메타데이터의 role 신뢰 제거
--
-- 046 이 profiles.role 의 UPDATE 권한을 회수해 "가입 후 자기 승격"은 막았지만,
-- **가입 시점**은 그대로 열려 있었다. handle_new_user 가
--   coalesce(new.raw_user_meta_data->>'role', 'patient')
-- 로 사용자가 제어하는 메타데이터를 그대로 신뢰하므로,
--   supabase.auth.signUp({ options: { data: { role: 'pharmacist' } } })
-- 만으로 profiles.role='pharmacist' 를 만들 수 있었다.
--
-- role 은 proxy.ts 와 pharmacy 레이아웃의 권한 경계다. 데이터 열람은 pharmacist_can_view()가
-- 별도로 막지만(role 이 아니라 pharmacies.owner_id 를 본다), 권한 필드가 사용자 입력에서
-- 유래해서는 안 된다.
--
-- 약사 계정은 scripts/create-pharmacy-account.mjs 가 service_role 로 발급하며,
-- 그 스크립트는 유저 생성 직후 profiles.role 을 명시적으로 UPDATE 한다.
-- service_role 은 이 회수 대상이 아니므로 발급 경로는 그대로 동작한다.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  insert into public.profiles (id, email, full_name, role, consent_health, consent_health_at)
  values (
    new.id,
    new.email,
    (new.raw_user_meta_data->>'full_name'),
    'patient',   -- 가입 메타데이터의 role 은 신뢰하지 않는다(승격은 service_role 전용)
    coalesce((new.raw_user_meta_data->>'consent_health')::boolean, false),
    case
      when (new.raw_user_meta_data->>'consent_health')::boolean
      then (new.raw_user_meta_data->>'consent_health_at')::timestamptz
      else null
    end
  );
  return new;
end;
$$;

-- CREATE OR REPLACE 는 기존 ACL 을 유지하지만, 046 의 회수 상태를 명시적으로 재확인한다.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
