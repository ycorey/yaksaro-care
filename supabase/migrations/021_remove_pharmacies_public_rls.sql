-- 021_remove_pharmacies_public_rls.sql
-- pharmacies_public_store_lookup 정책 제거.
-- 이 정책은 store_id가 있는 모든 약국 행(owner_id, phone, address)을
-- anon 포함 누구나 조회할 수 있게 허용했으나, 유일한 소비처인 /store/[store_id]
-- route는 admin 클라이언트를 사용하므로 이 정책은 불필요하면서 개인정보를 과다 노출했다.

DROP POLICY IF EXISTS "pharmacies_public_store_lookup" ON public.pharmacies;
