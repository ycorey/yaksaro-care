-- 070: interactions 테이블을 service_role 전용으로 좁힌다.
--
-- 왜: `/interactions` 페이지와 `/api/interactions/check` 를 삭제해 **앱 라우트**는 닫았지만,
--     001 의 정책이 아직 남아 있어 로그인 사용자가 anon key 로
--         GET /rest/v1/interactions?select=*
--     를 그대로 받는다. 즉 라우트만 닫혔고 **DUR 등재 원문은 PostgREST 로 열려 있다.**
--     그 원문은 처방자용 텍스트라 사용자에게 그대로 보이면 안 되는 것이 이 작업의 전제였다.
--
-- 안전한가: `interactions` 를 읽는 코드는 두 곳뿐이고 **둘 다 service_role** 이다.
--     · src/lib/dur-shadow.ts:25,65  (createAdminClient)
--     · src/lib/dur-otc-check.ts:36  (createAdminClient)
--   service_role 은 RLS 를 우회하므로 정책을 지워도 동작이 바뀌지 않는다.
--
-- ⚠️ `dur_single_flags` 는 **같이 좁히면 안 된다.** 약 지갑이 사용자 클라이언트로 읽는다
--    (src/app/(main)/@wallet/default.tsx:82 → getDurFlagsByItemSeq(supabase, …)).
--    좁히면 배지가 통째로 사라진다.
--
-- 적용: Supabase SQL Editor 에서 직접 실행(이 저장소 관례). 코드 배포와 순서 무관 —
--       적용 전에도 후에도 앱 동작은 같다.
-- 롤백: 아래 DROP 한 정책을 001_base_schema.sql 의 정의대로 다시 만들면 된다.

drop policy if exists "interactions_read" on public.interactions;

-- 068 의 성분 규칙표도 같은 성격이다(DUR 등재 원문 보관). 표와 정책 모두 **운영에 실재하고**
-- (068 은 2026-08-31 적용됨), 이 브랜치에는 소비 코드가 0건이다.
-- 지금 닫아 두면 나중에 화면이 붙을 때 "이미 열려 있었다" 는 상태를 물려받지 않는다.
--
-- ⚠️ `feat/interaction-engine-3a` 를 머지할 때 주의: 그 브랜치의
--    `src/lib/interactions-ingredient.ts` 는 넘겨받은 클라이언트로 이 표를 읽는다.
--    **service_role(admin) 로 호출할 것** — `interactions` 소비처 2곳과 같은 방식이다.
--    사용자 클라이언트로 부르면 이 정책이 없어 0행이 돌아온다(조용히 빈 결과).
drop policy if exists "ingredient_interactions_read" on public.ingredient_interactions;

-- 남은 권한을 확인하고 싶으면:
--   select policyname, roles, cmd from pg_policies where tablename = 'interactions';
-- (0행이어야 한다. RLS 는 켜진 채로 두어 service_role 외에는 아무도 못 읽는다.)
