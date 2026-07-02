-- SECURITY DEFINER 함수 search_path 고정 (Supabase advisor: function_search_path_mutable)
-- 001 handle_new_user · 019 end_expired_medications 두 레거시 함수만 누락돼 있던 것을
-- 최신 정의자 함수(014·031·037·038)와 동일하게 SET search_path = public 으로 통일.
-- CREATE OR REPLACE 이므로 운영 DB 재실행 무해 (본문 동일, 옵션만 추가).

-- 1) 회원가입 시 profiles 자동 생성 (001과 동일 본문 + search_path)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
begin
  insert into public.profiles (id, email, full_name, role, consent_health, consent_health_at)
  values (
    new.id,
    new.email,
    (new.raw_user_meta_data->>'full_name'),
    coalesce(new.raw_user_meta_data->>'role', 'patient'),
    coalesce((new.raw_user_meta_data->>'consent_health')::boolean, false),
    case
      when (new.raw_user_meta_data->>'consent_health')::boolean
      then (new.raw_user_meta_data->>'consent_health_at')::timestamptz
      else null
    end
  );
  return new;
end;
$function$;

-- 2) 만료 처방 약 자동 종료 (019와 동일 본문 + search_path)
CREATE OR REPLACE FUNCTION public.end_expired_medications(today date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_medications m
  SET ended_at = NOW()
  FROM user_prescriptions p
  WHERE m.prescription_id = p.id
    AND m.ended_at IS NULL
    AND m.deleted_at IS NULL
    AND p.prescribed_at IS NOT NULL
    AND p.duration_days IS NOT NULL
    AND (p.prescribed_at::date + p.duration_days) < today;
END;
$$;
