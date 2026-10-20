-- 073: public 스키마 34개 표의 Data API 권한(GRANT)을 전부 명시한다.
--
-- 왜 지금: Supabase 가 2026-10-30 부터 `public` 의 **새 표에 anon/authenticated/service_role
--   GRANT 를 자동으로 주지 않는다**(2026-09-24 공지). 기존 표는 현재 권한을 유지하므로 운영은
--   그대로다. 함정은 **재생성 환경**이다 — 새 프로젝트·프리뷰 브랜치·로컬 `db reset` 은 옛 표도
--   "신규" 로 취급해 권한이 통째로 빠진다. 운영은 멀쩡하고 테스트만 깨지는 형태로 나타난다.
--   저장소 마이그레이션 72개 중 `create table` 뒤에 GRANT 를 동봉한 것은 047·064·072 세 개뿐이다
--   (2026-10-19 12차 평가: 누락 21개). 하나씩 고치지 않고 **끝에서 한 번에** 선언한다 —
--   재생성 시 이 파일이 마지막에 돌아 앞의 누락을 전부 덮는다.
--
-- 원칙: 공지 예시(anon=select, 나머지=CRUD)를 복사하지 않고 표의 성격대로 최소만 준다.
--   · RLS 는 행을 가르고 GRANT 는 표를 가른다 — 둘은 별개의 층이다. GRANT 가 없으면 정책이
--     `using (true)` 로 잘못 들어와도 열리지 않는다. 그게 anon 을 회수하는 이유다.
--   · 운영에서 바뀌는 것은 **anon 회수**뿐이다. 코드 영향 0 의 근거(2026-10-20 실측):
--       - 세션 없이 표를 읽는 코드가 `src/` 에 없다(login 두 곳은 signIn 직후라 authenticated).
--       - 이 프로젝트 ref 를 쓰는 외부 코드는 `yaksaro-map/site/ter.html` 하나이고,
--         anon 키로 `POST /rest/v1/ter_requests` 만 한다(로컬 전 프로젝트 grep). waitlist 정책도 같은 꼴.
--       - 정책 없는 표(캐시·로그·쿼터)와 마스터 표 쓰기는 전부 createAdminClient 다.
--   · 참조 마스터(식약처 공개 데이터)도 anon 에서 회수한다. 001 정책이 `public` 으로 열어 둔 것은
--     "공개 데이터니까" 였지만 **읽는 anon 소비자가 0** 이다. 공개 데이터라도 안 쓰는 문은 닫는다.
--     나중에 로그아웃 화면이 약 검색을 붙이면 그때 `grant select … to anon` 한 줄을 그 이유와 함께 넣을 것.
--
-- ⚠️ 손대지 않는 것: profiles · pharmacies 의 테이블 레벨 UPDATE.
--   046 이 테이블 레벨을 회수하고 **컬럼 단위**로 다시 열었다(role·owner_id 등 차단).
--   Postgres 는 테이블 레벨 REVOKE 가 컬럼 권한까지 함께 회수하므로, 여기서 `revoke update`
--   를 치면 046 의 컬럼 권한이 사라져 설정 저장이 전부 막힌다. 두 표는 SELECT 만 선언한다.
--
-- 멱등: GRANT/REVOKE 는 반복 실행해도 같은 상태다. 운영에 두 번 돌려도 무해하다.
-- 적용: Supabase SQL Editor 에서 직접 실행(이 저장소 관례). **2026-10-30 전**.
-- 검증: e2e/rls-readonly-qa.mjs 의 `G` 단언(anon 토큰이 환자 표에서 42501 을 받는다).
--       적용 전에는 그 단언이 빨간불이다 — 그게 이 파일을 운영에 넣으라는 신호다.
-- 롤백: anon 에 되돌릴 것은 없다(코드가 쓰지 않았다). 특정 표만 되돌리려면 그 표에
--       `grant select, insert, update, delete on public.<t> to anon;` — 단 그럴 이유가 생기면
--       먼저 왜 anon 이 환자 표를 읽어야 하는지 적을 것.

grant usage on schema public to anon, authenticated, service_role;

-- 0) 바닥 — anon 은 전부 회수하고 아래에서 필요한 것만 되돌려준다.
revoke all on all tables in schema public from anon;

-- 1) service_role — 전부. RLS 를 우회하는 서버 전용 키라 표 단위로 가를 이유가 없다.
grant all on all tables in schema public to service_role;

-- 2) 참조 마스터(식약처·식품안전나라 공개 데이터) — 읽기만. 쓰기는 ETL·admin 이 한다.
revoke all on
  public.drugs, public.drug_identification, public.drug_ingredients,
  public.dur_single_flags, public.ingredient_norms, public.lifestyle_content, public.supplements
from authenticated;
grant select on
  public.drugs, public.drug_identification, public.drug_ingredients,
  public.dur_single_flags, public.ingredient_norms, public.lifestyle_content, public.supplements
to authenticated;

-- 072 의 결정 그대로 — 바코드 조회는 로그인 사용자만.
revoke all on public.drug_barcodes from authenticated;
grant select on public.drug_barcodes to authenticated;

-- 3) service_role 전용(정책이 하나도 없는 표) — 사용자 토큰에는 아무것도 주지 않는다.
--    070 이 interactions·ingredient_interactions 를 이 묶음으로 옮겼다. 정책만 지운 상태라
--    GET /rest/v1/interactions 는 "0행" 이었는데, 이제 "permission denied" 가 된다. 같은 뜻이다.
revoke all on
  public.api_quota, public.drug_summaries, public.ingredient_interactions, public.interactions,
  public.notification_runs, public.pharmacy_patients, public.prescriptions,
  public.pubmed_cache, public.supplement_interaction_cache
from anon, authenticated;

-- 4) 환자·약국 데이터 — authenticated 에 CRUD. 어느 행·어느 명령이 되는지는 RLS 정책이 가른다.
--    (정책이 허용하는 명령만 주는 더 좁은 형태는 upsert = INSERT+UPDATE 권한 같은 함정이 있어
--     이번엔 운영과 같은 범위를 유지한다. 좁히려면 표별 소비처를 먼저 적을 것.)
grant select, insert, update, delete on
  public.members, public.medication_schedules, public.medication_check_logs,
  public.pharmacy_patient_notes, public.pharmacy_requests, public.pharmacy_todos,
  public.push_subscriptions, public.user_medications, public.user_prescriptions
to authenticated;

-- shadow 로그 — 쓰는 쪽은 admin(dur-shadow.ts · supplement-interaction/shadow.ts)뿐이다.
revoke all on public.dur_shadow_logs, public.supplement_interaction_shadow_logs from authenticated;
grant select on public.dur_shadow_logs, public.supplement_interaction_shadow_logs to authenticated;

-- 064 그대로 — 질병분류기호는 수정 없이 넣고 지운다.
revoke all on public.prescription_diagnoses from authenticated;
grant select, insert, delete on public.prescription_diagnoses to authenticated;

-- 5) profiles · pharmacies — SELECT 만 테이블 레벨. UPDATE 는 046 의 컬럼 단위를 그대로 둔다(위 ⚠️).
grant select on public.profiles, public.pharmacies to authenticated;

-- 6) 외부 랜딩 폼 — 익명 INSERT 만. 읽기·수정·삭제는 cron(service_role) 의 일이다.
revoke all on public.ter_requests, public.waitlist from anon, authenticated;
grant insert on public.ter_requests, public.waitlist to anon, authenticated;

-- 7) 뷰 — 051 이 만든 약사용 3컬럼 뷰. 재생성 시 `create or replace view` 가 권한을 잃을 수 있어 재선언.
grant select on public.pharmacist_patient_view to authenticated;

-- 확인(선택): 적용 후 아래가 anon 행을 ter_requests·waitlist 의 INSERT **두 줄만** 보여야 한다.
--   select table_name, string_agg(privilege_type, ',' order by privilege_type)
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee = 'anon'
--   group by table_name order by table_name;
