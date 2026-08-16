-- 073_email_otps_unique.sql — one active OTP row per user (concurrent-resend safety).
DELETE FROM public.email_otps a USING public.email_otps b WHERE a.user_id = b.user_id AND a.ctid < b.ctid;
ALTER TABLE public.email_otps ADD CONSTRAINT email_otps_user_id_key UNIQUE (user_id);
