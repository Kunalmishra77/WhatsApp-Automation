-- 147 — Make a duplicate send impossible, not merely unlikely.
--
-- Migration 137 and the claim in lib/campaign-executor.ts closed the races that
-- sent 30,686 duplicate messages. They work by making sure two runs of a
-- campaign cannot start. This closes the class instead: even if two somehow do,
-- neither can send to a phone the other is sending to.
--
-- The mechanism is a reservation. A recipient row is inserted as 'queued'
-- BEFORE the message goes out, and a partial unique index makes a second
-- reservation for the same (campaign, phone) impossible while the first is
-- still in flight. The second run gets nothing back for that phone and skips
-- it.
--
-- Partial, on 'queued' only, for a reason: the 27,379 duplicate pairs already
-- in this table are an accurate record of messages that really went out, and
-- deleting them to make room for a plain unique index would replace one wrong
-- number with another. This index constrains only what is in flight.
--
-- The two guards cover different halves and need each other:
--   * the dedup read in executeCampaign skips phones already SENT to;
--   * this index stops two runs sending to the same phone AT ONCE.
--
-- ── The trade, stated plainly ────────────────────────────────────────────────
--
-- Exactly-once is not available: Meta's Cloud API takes no idempotency key, so
-- a process that dies between the send and the settle leaves a row whose fate
-- is genuinely unknown.
--
-- Those rows stay 'queued' and are NOT retried automatically. That is a choice:
-- a missed message costs one lead, and a duplicate costs the client's number
-- quality rating — which Meta throttles and bans on. So the default is silence.
-- Reservations are taken one batch of five at a time, immediately before that
-- batch is sent, so a crash leaves at most five phones in doubt rather than
-- thousands.
--
-- Resume releases them (app/api/campaigns/[id]/resume), because that is a
-- person deciding deliberately to take over a dead run. Automatic: never.
-- By hand: yes.

-- When the reservation was taken. `campaign_recipients` has sent_at,
-- delivered_at, read_at and replied_at but no created_at, so there was nothing
-- to tell a reservation from five seconds ago apart from one a dead run left
-- yesterday. Writing the reservation time into `sent_at` would have been the
-- cheap way and the wrong one: a row that says it was sent when it was not is
-- how the next wrong number gets built.
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS campaign_recipients_inflight_unique
  ON public.campaign_recipients (campaign_id, phone)
  WHERE status = 'queued';

COMMENT ON INDEX public.campaign_recipients_inflight_unique IS
  'Stops two concurrent runs reserving the same (campaign, phone). Partial on status=queued so the historical duplicate sent rows — a true record of messages that went out — are untouched.';

-- ── Reserve ──────────────────────────────────────────────────────────────────
--
-- Returns the phones it actually got. A phone already reserved by another run
-- conflicts, is silently skipped, and is simply absent from the result — which
-- is exactly how the caller learns not to send to it.
--
-- `ON CONFLICT DO NOTHING` with no target is deliberate and safe here: the only
-- other unique index on this table is the primary key on a generated id, so the
-- index above is the only thing a conflict can come from.
CREATE OR REPLACE FUNCTION public.campaign_reserve_phones(
  p_campaign uuid, p_workspace uuid, p_rows jsonb)
RETURNS TABLE(phone text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.campaign_recipients
    (campaign_id, workspace_id, contact_id, phone, name, status, reserved_at)
  SELECT p_campaign,
         p_workspace,
         NULLIF(r->>'contact_id', '')::uuid,
         r->>'phone',
         NULLIF(r->>'name', ''),
         'queued',
         now()
  FROM jsonb_array_elements(p_rows) AS r
  WHERE COALESCE(r->>'phone', '') <> ''
  ON CONFLICT DO NOTHING
  RETURNING public.campaign_recipients.phone;
$$;

-- ── Settle ───────────────────────────────────────────────────────────────────
--
-- Writes what happened onto the rows this run reserved. `status = 'queued'` in
-- the WHERE is the lock: a row that is no longer queued was settled by someone
-- else, and overwriting it is how a late write undoes a delivery receipt — the
-- bug migration 130 existed to fix.
CREATE OR REPLACE FUNCTION public.campaign_settle_phones(
  p_campaign uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.campaign_recipients cr
  SET status          = r.status,
      sent_at         = r.sent_at,
      whatsapp_msg_id = r.whatsapp_msg_id,
      error_message   = r.error_message
  FROM jsonb_to_recordset(p_rows)
    AS r(phone text, status text, sent_at timestamptz, whatsapp_msg_id text, error_message text)
  WHERE cr.campaign_id = p_campaign
    AND cr.phone = r.phone
    AND cr.status = 'queued';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── Release ──────────────────────────────────────────────────────────────────
--
-- Deletes reservations a dead run left behind, so the phones can be tried
-- again. Called only by Resume, which is a person saying "that run is over,
-- send the rest" — never on a timer, because a timer cannot know whether the
-- message went out and would reintroduce exactly the duplicates this prevents.
--
-- `p_older_than_minutes` guards against releasing a reservation a LIVE run is
-- about to settle: a batch is reserved and settled within seconds, so anything
-- older than a few minutes belonged to a run that is gone.
CREATE OR REPLACE FUNCTION public.campaign_release_stale_reservations(
  p_campaign uuid, p_workspace uuid, p_older_than_minutes integer DEFAULT 10)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.campaign_recipients
  WHERE campaign_id = p_campaign
    AND workspace_id = p_workspace
    AND status = 'queued'
    -- COALESCE so a reservation written before this column existed — there are
    -- none, but a NULL here would make the row unreleasable forever — is
    -- treated as old rather than as brand new.
    AND COALESCE(reserved_at, 'epoch'::timestamptz) < now() - make_interval(mins => p_older_than_minutes);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.campaign_reserve_phones(uuid, uuid, jsonb)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_settle_phones(uuid, jsonb)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_release_stale_reservations(uuid, uuid, integer)
  FROM public, anon, authenticated;
