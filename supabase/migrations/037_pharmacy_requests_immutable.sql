-- 037: pharmacy_requests 컬럼 변조 방지(M1). 034의 RLS는 행 접근만 게이트하고 컬럼 제한은
-- 앱 라우트에만 있었음 → 약사가 토큰으로 직접 환자 note/type/contact_phone을 재작성하거나
-- 환자가 status를 임의 enum으로 바꿀 수 있었음(양측 준신뢰·비임상이라 누수 아닌 무결성 문제).
-- BEFORE UPDATE 트리거로 status/responded_at 외 모든 컬럼을 OLD 값으로 고정(조용히 되돌림).

create or replace function public.pharmacy_requests_pin_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.id            := old.id;
  new.patient_id    := old.patient_id;
  new.pharmacy_id   := old.pharmacy_id;
  new.member_id     := old.member_id;
  new.type          := old.type;
  new.note          := old.note;
  new.contact_phone := old.contact_phone;
  new.created_at    := old.created_at;
  return new;
end;
$$;

drop trigger if exists trg_preq_pin_immutable on public.pharmacy_requests;
create trigger trg_preq_pin_immutable
  before update on public.pharmacy_requests
  for each row execute function public.pharmacy_requests_pin_immutable();
