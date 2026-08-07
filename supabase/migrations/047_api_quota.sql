-- 047: 사용자별 API 호출 쿼터 (유료 외부 API 남용·공공 API 일일한도 소진 방지)
--
-- 배경: 인증 게이트는 모든 유료 경로 앞단에 있으나, 소셜 가입 비용이 0이라
-- 인증만으로는 부족하다. CLOVA OCR·OpenAI·Anthropic 과금과 data.go.kr 일일 한도
-- (소진 시 전 사용자 약품 조회 마비)를 사용자 단위로 막는다.
--
-- 설계 원칙(046 의 C1 교훈): 클라이언트가 직접 호출할 수 있는 SECURITY DEFINER 함수를
-- 만들지 않는다. 이 함수는 service_role 전용이고, p_user 는 서버 라우트가
-- auth.getUser() 로 검증한 값만 넘긴다(클라이언트 입력 아님).

CREATE TABLE IF NOT EXISTS public.api_quota (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket       text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, window_start)
);

-- RLS 활성 + 정책 0개 = 클라이언트 토큰으로는 전면 차단(deny-all).
-- 접근 경로는 아래 consume_quota() 뿐이다.
ALTER TABLE public.api_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_quota FROM anon, authenticated;

-- 고정 윈도우 카운터. 증가 후의 카운트를 돌려주고, 한도 비교는 호출부(서버 라우트)가 한다.
-- 한도를 인자로 받지 않으므로 인자 조작으로 우회할 여지가 없다.
CREATE OR REPLACE FUNCTION public.consume_quota(
  p_user       uuid,
  p_bucket     text,
  p_window_sec integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w timestamptz;
  c integer;
BEGIN
  IF p_user IS NULL OR p_bucket IS NULL OR p_window_sec IS NULL OR p_window_sec < 1 THEN
    RETURN 0;   -- 잘못된 호출은 계측하지 않는다(기능을 막지도 않는다)
  END IF;

  -- 윈도우 경계로 내림
  w := to_timestamp(floor(extract(epoch from now()) / p_window_sec) * p_window_sec);

  INSERT INTO public.api_quota AS q (user_id, bucket, window_start, count)
  VALUES (p_user, p_bucket, w, 1)
  ON CONFLICT (user_id, bucket, window_start)
  DO UPDATE SET count = q.count + 1
  RETURNING q.count INTO c;

  -- 지난 윈도우 정리 — (user, bucket) 당 항상 1행만 남으므로 테이블이 증식하지 않는다.
  DELETE FROM public.api_quota
   WHERE user_id = p_user AND bucket = p_bucket AND window_start < w;

  RETURN c;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_quota(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_quota(uuid, text, integer) TO service_role;
