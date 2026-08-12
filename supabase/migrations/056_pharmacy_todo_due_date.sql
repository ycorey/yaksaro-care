-- 056: 약국 '할 일' 메모에 날짜를 준다.
--
-- 045 로 만든 pharmacy_todos 에는 날짜가 없었다(created_at 만). 그래서 한 번 적으면 완료할
-- 때까지 "오늘 할 일" 목록에 남고, 어제 적은 것과 오늘 적은 것이 구분되지 않았다.
-- 약사 표현으로 "오늘 할 일인데 그 오늘이 언제인지 알 수가 없다".
--
-- 백필 기준은 **KST 날짜**다. created_at 은 timestamptz(UTC 저장)이므로 그냥 ::date 로 자르면
-- 한국 시간 밤 9시 이후에 적은 메모가 하루 전으로 밀린다. 약국은 저녁에 다음날 발주 메모를
-- 적는 일이 흔해서 이 오차가 실제로 눈에 띈다.

alter table public.pharmacy_todos
  add column if not exists due_date date;

update public.pharmacy_todos
   set due_date = (created_at at time zone 'Asia/Seoul')::date
 where due_date is null;

alter table public.pharmacy_todos
  alter column due_date set not null;

-- 기본값은 안전망일 뿐이다 — 앱은 항상 todayKST() 로 계산한 날짜를 명시해서 보낸다.
-- (current_date 는 UTC 기준이라 KST 자정~오전 9시 사이에 하루 어긋난다.)
alter table public.pharmacy_todos
  alter column due_date set default (now() at time zone 'Asia/Seoul')::date;

-- 날짜별 조회 + '밀린 일'(due_date < 오늘 and not done) 조회를 함께 태운다.
create index if not exists idx_pharmacy_todos_due
  on public.pharmacy_todos (pharmacy_id, due_date, done);

comment on column public.pharmacy_todos.due_date is
  '이 메모를 처리할 날짜(KST). 밀린 일은 날짜를 옮기지 않고 원래 날짜를 유지한다.';
