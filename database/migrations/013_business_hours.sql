BEGIN;

CREATE TABLE IF NOT EXISTS public.business_hours (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
  timezone     VARCHAR(100) DEFAULT 'Asia/Kolkata',
  is_enabled   BOOLEAN DEFAULT false,
  away_message TEXT DEFAULT 'We are currently closed. Our support hours are Monday to Saturday, 10AM to 6PM IST. We will respond to your message as soon as we are back!',
  -- schedule: array of 7 day objects (0=Sun..6=Sat)
  -- [{day:0, is_open:false, open:"09:00", close:"18:00"}, ...]
  schedule     JSONB DEFAULT '[
    {"day":0,"is_open":false,"open":"09:00","close":"18:00"},
    {"day":1,"is_open":true,"open":"09:00","close":"18:00"},
    {"day":2,"is_open":true,"open":"09:00","close":"18:00"},
    {"day":3,"is_open":true,"open":"09:00","close":"18:00"},
    {"day":4,"is_open":true,"open":"09:00","close":"18:00"},
    {"day":5,"is_open":true,"open":"09:00","close":"18:00"},
    {"day":6,"is_open":true,"open":"09:00","close":"13:00"}
  ]',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bh_workspace" ON public.business_hours;
CREATE POLICY "bh_workspace" ON public.business_hours FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

COMMIT;
