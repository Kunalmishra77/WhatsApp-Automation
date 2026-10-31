-- 143 — Notice a duplicate send in hours, not months.
--
-- 30,686 campaign messages went out twice before anyone looked. The races that
-- caused them are closed (lib/campaign-executor.ts claims the campaign,
-- lib/campaign-stuck.ts decides what "stuck" means, and the queue claim is
-- conditional). What was missing is any way to find out — the only reason this
-- was found at all is that someone went looking for an unrelated thing.
--
-- So: a number the health monitor reads every hour. If the fixes have a hole,
-- it shows up the same day.

-- The heartbeat lookup, which now decides whether a live campaign gets reset.
-- Measured without it, on the largest campaign (18,449 recipients):
--
--   Sort (top-N heapsort) ← Bitmap Heap Scan on campaign_recipients
--     rows=18449   Buffers: shared hit=654   7.5 ms
--
-- It reads every recipient of the campaign to find one timestamp, and it runs
-- every five minutes per processing job. With this index it is a seek to the
-- campaign and the first entry.
--
-- (campaign_id, sent_at DESC) is a superset of idx_cr_campaign, which is
-- therefore redundant — left in place, like idx_cr_workspace in migration 135,
-- until the planner is confirmed to prefer this one in production. Dropping the
-- index the current plans depend on is not a change to make blind.
CREATE INDEX IF NOT EXISTS idx_cr_campaign_sent
  ON public.campaign_recipients (campaign_id, sent_at DESC);

-- How many phone numbers were sent the same campaign more than once recently.
--
-- `whatsapp_msg_id IS NOT NULL` is the test for "Meta accepted it", which is
-- also the test for "the client was charged". A duplicate row with no msg_id is
-- bookkeeping; a duplicate with one is a customer who got the message twice.
--
-- Deliberately NOT indexed on sent_at for this. The query is a parallel scan of
-- 404k rows at ~50 ms, run hourly — 1.2 seconds of database time a day. An
-- index on sent_at would be maintained on every one of the ~100k sends a month
-- to save that, which is the wrong trade.
CREATE OR REPLACE FUNCTION public.campaign_duplicate_sends(p_since timestamptz)
RETURNS TABLE(pairs bigint, extra_sends bigint, campaigns bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(count(*), 0)::bigint,
         COALESCE(sum(d.n - 1), 0)::bigint,
         COALESCE(count(DISTINCT d.campaign_id), 0)::bigint
  FROM (
    SELECT campaign_id, phone, count(*) AS n
    FROM public.campaign_recipients
    WHERE sent_at >= p_since
      AND whatsapp_msg_id IS NOT NULL
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) d;
$$;

-- Service-role only, as every other SECURITY DEFINER function here: it reads
-- across every workspace's campaigns.
REVOKE ALL ON FUNCTION public.campaign_duplicate_sends(timestamptz)
  FROM public, anon, authenticated;
