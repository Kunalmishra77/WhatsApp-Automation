-- 129 — One lead per contact, enforced rather than hoped for.
--
-- The webhook's auto-lead path checks whether a lead already exists for
-- (workspace_id, contact_id) and inserts one if not. There is no unique
-- constraint behind that check, so when several inbound events for the same
-- contact are processed at once, every one of them passes the check and every
-- one inserts. Nothing in the code is wrong-looking; it is a plain race.
--
-- The evidence, from 8,765 leads: 222 contacts have more than one lead, 231 rows
-- in excess, worst case five on one contact. 219 of the 222 groups were created
-- inside ten seconds, and not one group was created more than an hour apart — so
-- nobody has ever deliberately kept two leads for the same contact, and a unique
-- index takes nothing away.
--
-- It also quietly corrupted reporting. `leads` is embedded in the Conversations
-- page's temperature counts, so those were inflated in ten of twelve workspaces
-- until migration 127, and `total` until 128.
--
-- Only two fields ever differ inside a group: ai_score (19 groups) and stage
-- (11). temperature, assigned_agent_id, value, source and conversation_id are
-- always identical, so the merge below only has to decide those two.
--
--   ai_score → the maximum. A score is accumulated evidence; the highest is the
--              best information anyone had.
--   stage    → the strongest outcome, by an explicit rank rather than the enum's
--              own order or a timestamp. Both easier rules were tried against
--              the real rows first and both were wrong:
--
--              `max(stage)` follows the enum, where `lost` (6) sorts after
--              `converted` (5) — so a converted lead would be recorded as lost.
--
--              "whichever row was updated last" looked principled and was worse.
--              A dry run showed it turning a group that is currently `lost` back
--              into `contacted`, reopening a lead a person had closed, and
--              pulling three groups from `contacted` back to `new`. updated_at
--              is bumped by the temperature trigger and the AI scorer, so it
--              marks the last automated write, not the last decision.
--
--              The rank: converted > lost > interested > follow_up > contacted >
--              new. A sale outranks a close; a close outranks any amount of
--              pipeline, because somebody chose it and a merge must not undo it.

-- The survivor of each group: oldest first, id as a stable tiebreak.
CREATE TEMP TABLE lead_merge AS
SELECT id,
       first_value(id) OVER (
         PARTITION BY workspace_id, contact_id ORDER BY created_at, id
       ) AS keeper_id
FROM public.leads
WHERE contact_id IS NOT NULL;

CREATE INDEX ON lead_merge (keeper_id);
CREATE INDEX ON lead_merge (id);

-- What each survivor should end up holding.
CREATE TEMP TABLE lead_merged_values AS
SELECT m.keeper_id,
       max(l.ai_score) AS ai_score,
       (ARRAY_AGG(l.stage ORDER BY
          CASE l.stage::text
            WHEN 'converted'  THEN 6
            WHEN 'lost'       THEN 5
            WHEN 'interested' THEN 4
            WHEN 'follow_up'  THEN 3
            WHEN 'contacted'  THEN 2
            WHEN 'new'        THEN 1
            ELSE 0
          END DESC, l.created_at
        ))[1] AS stage
FROM lead_merge m
JOIN public.leads l ON l.id = m.id
GROUP BY m.keeper_id
HAVING count(*) > 1;

UPDATE public.leads l
SET ai_score = v.ai_score,
    stage    = v.stage
FROM lead_merged_values v
WHERE l.id = v.keeper_id
  AND (l.ai_score IS DISTINCT FROM v.ai_score OR l.stage IS DISTINCT FROM v.stage);

-- Children move to the survivor before anything is deleted. lead_stage_history
-- and lead_score_history cascade on delete and marketing_touchpoints is set to
-- null, so skipping this would throw away history and lose ad attribution.
UPDATE public.lead_score_history h
SET lead_id = m.keeper_id
FROM lead_merge m
WHERE h.lead_id = m.id AND m.id <> m.keeper_id;

UPDATE public.lead_stage_history h
SET lead_id = m.keeper_id
FROM lead_merge m
WHERE h.lead_id = m.id AND m.id <> m.keeper_id;

UPDATE public.marketing_touchpoints t
SET lead_id = m.keeper_id
FROM lead_merge m
WHERE t.lead_id = m.id AND m.id <> m.keeper_id;

DELETE FROM public.leads l
USING lead_merge m
WHERE l.id = m.id AND m.id <> m.keeper_id;

-- Plain, not partial: Postgres treats NULLs as distinct, so this still allows
-- any number of leads with no contact (there are none today), and a plain index
-- is what ON CONFLICT can infer from in the code path that follows.
CREATE UNIQUE INDEX IF NOT EXISTS leads_workspace_contact_unique
  ON public.leads (workspace_id, contact_id);

DROP TABLE lead_merge;
DROP TABLE lead_merged_values;
