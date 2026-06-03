-- user_prescriptions UPDATE RLS 정책 추가
-- OCR 확인 후 조제약국명을 저장할 때 일반 클라이언트로 UPDATE 가능하게 한다.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_prescriptions' AND policyname = 'user_prescriptions_update'
  ) THEN
    CREATE POLICY "user_prescriptions_update" ON public.user_prescriptions
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
