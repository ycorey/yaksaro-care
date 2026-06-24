-- 038: 약사 자유 텍스트 회신 + 환자 1탭 확인.
-- 037 트리거를 역할 분기로 교체해 새 회신 컬럼의 쓰기 권한을 컬럼 단위로 강제.

alter table public.pharmacy_requests
  add column if not exists reply_text     text,
  add column if not exists replied_at     timestamptz,
  add column if not exists patient_ack_at timestamptz;

-- 037의 pin 함수 교체(같은 트리거명 재정의). status/responded_at 외 컬럼을
-- 역할(환자/약사)에 따라 OLD로 고정해 변조 차단.
create or replace function public.pharmacy_requests_pin_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 공통: 식별·원본 컬럼은 어느 쪽도 변경 불가
  new.id            := old.id;
  new.patient_id    := old.patient_id;
  new.pharmacy_id   := old.pharmacy_id;
  new.member_id     := old.member_id;
  new.type          := old.type;
  new.note          := old.note;
  new.contact_phone := old.contact_phone;
  new.created_at    := old.created_at;

  if auth.uid() = old.patient_id then
    -- 환자: status(취소)·patient_ack_at만 허용 → 약사 회신 필드 고정
    new.reply_text   := old.reply_text;
    new.replied_at   := old.replied_at;
    new.responded_at := old.responded_at;
  else
    -- 약사(RLS가 자기 약국으로 이미 제한): reply_text·replied_at·status·responded_at 허용
    -- → 환자 전용 필드 고정
    new.patient_ack_at := old.patient_ack_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_preq_pin_immutable on public.pharmacy_requests;
create trigger trg_preq_pin_immutable
  before update on public.pharmacy_requests
  for each row execute function public.pharmacy_requests_pin_immutable();
