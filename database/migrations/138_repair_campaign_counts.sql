-- 138 — Make the campaign counters match the recipients they are counted from.
--
-- `campaigns.sent_count/delivered_count/read_count/failed_count` are a cache of
-- `campaign_recipients`. On 2026-10-30, 9 of the 138 campaigns with recipients
-- held a number the table does not support. Two kinds:
--
-- Two campaigns, both touched today, both off by exactly one failure:
--
--   Couple Membership   failed_count 282 stored, 281 in the table
--   30% Off             failed_count 1178 stored, 1177 in the table
--
-- These are the platform's two largest active campaigns, and that is the clue.
-- The code that wrote these numbers ran four exact counts in parallel and then
-- an update — four snapshots, then a write. Two receipts arriving together each
-- counted and each wrote, and whichever finished last persisted ITS snapshot,
-- so a stale number could stick permanently. Migration 137 removed the race by
-- counting and writing in one statement; it cannot undo what the race already
-- wrote.
--
-- Seven campaigns from 19–26 August with much larger gaps, e.g.
--
--   Razorveda_03   sent 139 stored / 682 in table,  failed 593 / 50
--   Razorveda02    sent 139 / 622,                  failed 557 / 74
--
-- These predate both the status-advance guard (migration 130) and the fix that
-- keeps sent_count moving as receipts arrive, which is the era they come from.
--
-- `campaign_recipients` is the source of truth in every case — the four columns
-- exist only so a campaign list does not have to count rows — so the repair is
-- to recount. Client-visible numbers DO move: these seven August campaigns will
-- show a higher sent count and a much lower failure count than they did, which
-- is the direction the row-level data says is correct.
--
-- Deliberately uses migration 137's function rather than restating the rule, so
-- the repair and the live path can never disagree about what "delivered" means.

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT DISTINCT campaign_id FROM public.campaign_recipients WHERE campaign_id IS NOT NULL
  LOOP
    PERFORM public.campaign_sync_delivery_counts(c.campaign_id);
  END LOOP;
END $$;
