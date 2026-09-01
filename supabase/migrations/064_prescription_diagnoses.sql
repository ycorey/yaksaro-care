-- 064: 처방전 질병분류기호(KCD) — 별도 테이블
--
-- 왜 user_prescriptions 에 컬럼을 붙이지 않는가:
--   014/031 의 prescriptions_pharmacist_view 는 RLS **행** 정책이라, 통과하면 그 행의 모든 컬럼이
--   열린다(051 이 profiles 에서 같은 이유로 뷰 분리를 택했다). 컬럼을 추가하는 순간 동의·단골
--   약사 토큰에 질병분류기호가 자동 노출되고, 앱 select 에서 빼도 PostgREST 직접 조회로 읽힌다.
--   컬럼 단위 GRANT 로도 못 막는다 — 약사도 환자도 같은 authenticated 롤이라 롤 단위로 컬럼을
--   나누면 환자 본인 화면까지 막힌다. 테이블을 분리하면 "약사에게 보일지"가 정책 1줄의 문제가 된다.
--
-- ⚠️ 이 테이블에는 약사 정책을 두지 않는다. 빠뜨린 게 아니라 의도된 공백이다.
--    진료과(department)는 약사에게 열려 있고 patients/[id] 주석이 그 노출을 명시적 가치로
--    선언하고 있어(“어느 과에서 받으신 거예요?”), 다음 사람이 좋은 마음으로
--    `for select using (pharmacist_can_view(user_id))` 를 추가하기 쉽다.
--    질병분류기호는 진료과와 다른 등급의 민감정보이며, 처리방침 제2조 고지와 별도 동의 설계가
--    끝나기 전에는 열지 않는다. e2e/pharmacist-rls-qa 가 매 실행마다
--    (a) 동의한 약사에게도 0건 (b) 정책이 정확히 pd_self_* 3개 임을 계측한다.
--
-- 채움: OCR(api/ocr)이 추출 → 사용자가 검수 화면에서 확인·삭제 → api/medications/bulk 가 저장.
--   /api/ocr 은 저장하지 않는다. 질병분류기호는 환자가 처방전 기재 자체를 거부할 수 있는
--   항목(의료법 시행규칙 §12)이라, 사용자가 보지 못한 상태로 남겨서는 안 된다.

create table if not exists public.prescription_diagnoses (
  prescription_id uuid not null
    references public.user_prescriptions(id) on delete cascade,
  code_norm       text not null,
  code            text not null,
  label           text,
  source          text not null default 'ocr',
  -- RLS 술어를 서브쿼리 없이 auth.uid() = user_id 로 쓰기 위한 비정규화.
  -- FK 대상은 050 패턴대로 auth.users — 탈퇴 시 파기가 처방 경유·직접 두 경로로 보장된다.
  user_id         uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  -- code_norm 이 PK 의 일부라 bulk 재호출(뒤로가기 후 재저장)의 중복을 DB 가 막는다.
  primary key (prescription_id, code_norm),
  -- API 가 normalizeKcd() 재검증을 빠뜨려도 형식 밖 값은 못 들어온다(src/lib/kcd.ts 의 KCD_NORM_RE 와 동일).
  constraint prescription_diagnoses_norm_format
    check (code_norm ~ '^[A-Z][0-9]{2}(\.[0-9]{1,3})?$'),
  constraint prescription_diagnoses_code_len
    check (char_length(code) between 1 and 16),
  constraint prescription_diagnoses_source
    check (source in ('ocr', 'manual'))
);

comment on table public.prescription_diagnoses is
  '처방전에 적힌 질병분류기호(KCD). 환자 본인만 접근한다. 약사 정책 없음 — 의도된 공백이다.';
comment on column public.prescription_diagnoses.code is
  'OCR 원문 그대로. 보정 로직이 틀렸을 때 되짚을 수 있는 유일한 흔적이라 검수 화면에도 이 값을 보여준다.';
comment on column public.prescription_diagnoses.code_norm is
  '대문자화·오인식 보정·점 정규화를 거친 값. 마스터 조인 키이자 중복 방지 키.';
comment on column public.prescription_diagnoses.label is
  'KCD 마스터에서 가져온 질환명. 마스터 적재(2단계) 전까지는 항상 null — 화면은 장(chapter) 라벨을 앱에서 계산해 쓴다.';

alter table public.prescription_diagnoses enable row level security;

-- 정책 대상을 to authenticated 로 좁힌다(046 주석의 권고). anon 은 auth.uid() 가 null 이라
-- 어차피 0건이지만, 대상을 명시해 두어야 나중에 참조 함수 EXECUTE 를 회수할 수 있다.
drop policy if exists "pd_self_select" on public.prescription_diagnoses;
create policy "pd_self_select" on public.prescription_diagnoses
  for select to authenticated using (auth.uid() = user_id);

-- INSERT 는 두 조건이 모두 필요하다.
--   auth.uid() = user_id  : 남의 이름표를 달지 못하게
--   EXISTS(처방 소유 확인) : 남의 처방 행에 붙이지 못하게
-- ⚠️ EXISTS 만 두면 뚫린다 — 약사 토큰은 prescriptions_pharmacist_view 정책으로 동의 환자의
--    처방 행을 SELECT 할 수 있어 EXISTS 가 참이 되기 때문이다.
drop policy if exists "pd_self_insert" on public.prescription_diagnoses;
create policy "pd_self_insert" on public.prescription_diagnoses
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_prescriptions p
      where p.id = prescription_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "pd_self_delete" on public.prescription_diagnoses;
create policy "pd_self_delete" on public.prescription_diagnoses
  for delete to authenticated using (auth.uid() = user_id);

-- UPDATE 정책은 두지 않는다. 코드는 고쳐 쓰는 값이 아니라 지우고 다시 넣는 값이다
-- (2단계의 label 채우기는 service_role ETL 이 한다 — RLS 를 우회하므로 정책이 필요 없다).
--
-- RLS 활성 + 정책 부재만으로도 default deny 지만, Supabase 가 public 스키마 신규 테이블에
-- 기본 부여하는 GRANT 를 남겨 두면 "이 테이블은 수정하지 않는다"가 스키마에 드러나지 않는다.
-- 053 의 교훈대로 REVOKE 대상에서 authenticated 를 빠뜨리지 말 것 — 빠뜨리면 아무것도 안 좁혀진다.
revoke update on public.prescription_diagnoses from public, anon, authenticated;
revoke all    on public.prescription_diagnoses from public, anon;

-- 인덱스는 만들지 않는다. prescription_id 가 PK 선두 컬럼이라 지갑 임베드 조회에 이미 쓰이고,
-- user_id 로 직접 조회하는 화면이 없다(036 의 인덱스 최소 원칙).
