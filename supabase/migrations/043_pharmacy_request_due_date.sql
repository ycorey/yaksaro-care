-- 043: 약사 요청 마감일(due_date) — 오늘 중심 아젠다. 유형기본=접수일(당일), 약사 조정.
alter table public.pharmacy_requests
  add column if not exists due_date date;

-- 기존 행 백필: 접수일(KST) 기준
update public.pharmacy_requests
  set due_date = (created_at at time zone 'Asia/Seoul')::date
  where due_date is null;

-- 038 역할분기 트리거 함수 교체: 환자는 due_date 변경 불가(고정), 약사만 수정 허용.
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

  if auth.uid() = old.patient_id then
    new.reply_text   := old.reply_text;
    new.replied_at   := old.replied_at;
    new.responded_at := old.responded_at;
    new.due_date     := old.due_date;   -- 환자는 마감일 변경 불가
  else
    new.patient_ack_at := old.patient_ack_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_preq_pin_immutable on public.pharmacy_requests;
create trigger trg_preq_pin_immutable
  before update on public.pharmacy_requests
  for each row execute function public.pharmacy_requests_pin_immutable();
