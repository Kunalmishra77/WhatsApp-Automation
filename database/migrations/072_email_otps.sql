-- 072_email_otps.sql — email verification codes for self-service signup.
CREATE TABLE IF NOT EXISTS public.email_otps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_otps_user ON public.email_otps (user_id);
ALTER TABLE public.email_otps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_otps_no_client ON public.email_otps;
CREATE POLICY email_otps_no_client ON public.email_otps FOR ALL USING (false) WITH CHECK (false);
