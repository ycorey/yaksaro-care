-- 048: 푸시 구독을 "기기 1대 = 계정 1개"로 강제
--
-- 배경: 유니크 키가 (user_id, endpoint) 라서 같은 endpoint 에 여러 user_id 가 매핑될 수 있었다.
-- A 가 알림을 켠 채 로그아웃 → 같은 기기에서 B 가 로그인해 알림을 켜면 충돌 없이 (B, endpoint)
-- 행이 추가되고, 그 기기로 A·B 양쪽 알림이 모두 간다. 특히 약사 회신 푸시는 자유 텍스트를
-- 본문에 싣기 때문에 A 앞으로 온 약국 메시지가 B 의 잠금화면에 뜬다.
--
-- endpoint 는 브라우저/기기당 유일한 값이므로 유니크 키로 적합하다.
-- (로그아웃 시 구독 해제는 lib/purge 에서 별도로 처리한다. 이 마이그레이션은 그 경로가
--  동작하지 않은 경우 — 앱 강제종료·이전 버전 — 를 위한 심층 방어다.)

-- 1) 기존 중복 endpoint 정리: 가장 최근 등록만 남긴다(= 현재 그 기기를 쓰는 계정).
DELETE FROM public.push_subscriptions a
USING public.push_subscriptions b
WHERE a.endpoint = b.endpoint
  AND (a.created_at < b.created_at
       OR (a.created_at = b.created_at AND a.id < b.id));

-- 2) 유니크 키 교체
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_endpoint_key;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
