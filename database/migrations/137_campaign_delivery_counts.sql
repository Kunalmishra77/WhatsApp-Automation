-- 137 — Four counts and an update, on every delivery receipt.
--
-- Every 'delivered', 'read' or 'failed' webhook that advanced a recipient row
-- re-aggregated the campaign's totals with four separate exact counts and then
-- wrote them back: five round trips, four scans of the same recipient rows, on
-- the path between Meta's receipt and the next one.
--
-- From pg_stat_statements, since 17 Sept, the three `status = ANY(...)` counts
-- share one entry:
--
--   WHERE campaign_id = $1 AND status = ANY($2)
--     113,905 calls   3.7 ms mean   417.3 s total
--
-- That is ~38,000 receipts × 3, and the fourth count (status = 'failed') is its
-- own entry on top. It is the largest application statement still being issued.
--
-- Measured on the platform's largest campaign (18,449 recipients):
--
--   one count                                  7.7 ms    651 buffers
--   the four together                        ~31   ms  2,604 buffers
--   one pass with FILTER clauses              12.7 ms    651 buffers
--
-- The counts exist only to be written to `campaigns`, so the write belongs in
-- the same statement: five round trips become one.
--
-- Deliberately only these four columns. `campaigns` also has filtered_count and
-- replied_count, which this path has never maintained — replied_count is
-- campaign-reply-sync's, and recomputing it from a delivery receipt would make
-- this function the second writer of a number it does not own.

CREATE OR REPLACE FUNCTION public.campaign_sync_delivery_counts(p_campaign uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.campaigns c
  SET sent_count      = s.sent,
      delivered_count = s.delivered,
      read_count      = s.read,
      failed_count    = s.failed
  FROM (
    -- The same cumulative rule the four counts encoded: a replied recipient was
    -- also read, a read one was also delivered, a delivered one was also sent.
    -- 'failed' sits outside that chain, and 'filtered' outside all of it.
    SELECT
      count(*) FILTER (WHERE status IN ('sent', 'delivered', 'read', 'replied')) AS sent,
      count(*) FILTER (WHERE status IN ('delivered', 'read', 'replied'))         AS delivered,
      count(*) FILTER (WHERE status IN ('read', 'replied'))                      AS read,
      count(*) FILTER (WHERE status = 'failed')                                  AS failed
    FROM public.campaign_recipients
    WHERE campaign_id = p_campaign
  ) s
  WHERE c.id = p_campaign;
$$;

-- Service-role only, as migrations 064 and 136 locked down theirs: the webhook
-- calls with the admin client, and SECURITY DEFINER bypasses RLS — reachable
-- from `authenticated` this would rewrite any workspace's campaign totals.
REVOKE ALL ON FUNCTION public.campaign_sync_delivery_counts(uuid)
  FROM public, anon, authenticated;
