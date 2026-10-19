-- 113 — Re-apply the engagement cap to leads already scored, free of AI cost.
--
-- The old cap only guarded the <= 1 message case and jumped straight to no cap at
-- two, so an ad lead whose whole conversation was Meta's pre-filled opening plus
-- one word ("Price", "Amount", "कितने का है") scored 70-75 and was shown as Hot.
-- Razorveda had 44 such leads. engagementCap() in lib/lead-classifier.ts now
-- scales with how much the customer actually said, and this applies the same
-- curve to leads that were already classified.
--
-- No model calls: the cap clamps the stored score, so this is pure arithmetic.
--
-- COOLS ONLY. A lead is never promoted here. Scores from the 05-06 Oct classifier
-- are known to have over-scored, and ~1,300 of those leads had their temperature
-- corrected to Cold by hand without the score being lowered. Deriving temperature
-- from those stale scores would undo that correction and flood clients with false
-- Hots — the very complaint this migration answers. Resolving those properly needs
-- a fresh classification, which is a separate, paid job.

BEGIN;

CREATE TEMP TABLE _recap AS
WITH trusted AS (
  SELECT workspace_id, public.prefill_norm(text) AS ntext
  FROM meta_ad_prefill_messages
  WHERE (NOT auto_learned OR (seen_count >= 2 AND length(public.prefill_norm(text)) >= 25))
    AND length(public.prefill_norm(text)) >= 12
),
th AS (
  SELECT id AS workspace_id,
    coalesce((settings->'lead_rules'->'thresholds'->>'hot')::int, 61)  AS hot,
    coalesce((settings->'lead_rules'->'thresholds'->>'warm')::int, 31) AS warm
  FROM workspaces
),
counts AS (
  SELECT l.id, l.workspace_id, l.ai_score, l.temperature,
    (l.source IN ('meta_ad','instagram_ad') OR l.ad_id IS NOT NULL) AS src_ad,
    (SELECT count(*) FROM messages m
      WHERE m.conversation_id = l.conversation_id AND m.direction = 'inbound'
        AND coalesce(btrim(m.content),'') <> ''
        -- Our own notice about media WhatsApp couldn't deliver, not their words.
        AND m.content NOT LIKE '⚠️%'
        -- The ad's pre-filled opening is Meta's sentence, not the customer's.
        AND NOT EXISTS (
          SELECT 1 FROM trusted t
          WHERE t.workspace_id = l.workspace_id
            AND (public.prefill_norm(m.content) = t.ntext
              OR (length(t.ntext) >= 25 AND starts_with(public.prefill_norm(m.content), t.ntext)))
        )
    )::int AS real_msgs,
    EXISTS (
      SELECT 1 FROM messages m JOIN trusted t ON t.workspace_id = l.workspace_id
      WHERE m.conversation_id = l.conversation_id AND m.direction = 'inbound'
        AND (public.prefill_norm(m.content) = t.ntext
          OR (length(t.ntext) >= 25 AND starts_with(public.prefill_norm(m.content), t.ntext)))
    ) AS has_prefill
  FROM leads l
  WHERE l.ai_score IS NOT NULL AND l.stage <> 'converted'
)
SELECT c.id, c.workspace_id, c.ai_score, c.temperature, c.real_msgs,
  least(c.ai_score, CASE
    WHEN c.real_msgs <= 0 THEN (CASE WHEN (c.src_ad OR c.has_prefill) THEN 25 ELSE 45 END)
    WHEN c.real_msgs  = 1 THEN 45
    WHEN c.real_msgs  = 2 THEN 60
    WHEN c.real_msgs <= 4 THEN 85
    ELSE 100 END) AS new_score,
  t.hot, t.warm
FROM counts c JOIN th t ON t.workspace_id = c.workspace_id;

CREATE INDEX ON _recap (id);

-- Resolve each lead's new band, then keep only the rows where the cap actually
-- cools something. `rank` makes "never promote" explicit.
CREATE TEMP TABLE _apply AS
SELECT r.*,
  CASE WHEN r.new_score >= r.hot THEN 'hot'
       WHEN r.new_score >= r.warm THEN 'warm'
       ELSE 'cold' END AS new_temp
FROM _recap r;

DELETE FROM _apply
WHERE NOT (
  -- cooler or same band ...
  (CASE new_temp WHEN 'hot' THEN 3 WHEN 'warm' THEN 2 ELSE 1 END)
  <= (CASE coalesce(temperature,'cold') WHEN 'hot' THEN 3 WHEN 'warm' THEN 2 ELSE 1 END)
  -- ... and something actually changes
  AND (new_score < ai_score OR new_temp <> coalesce(temperature,''))
);

-- Record the band moves so a client can see why a lead cooled.
INSERT INTO public.lead_score_history (lead_id, workspace_id, from_temperature, to_temperature, score, confidence, reason)
SELECT a.id, a.workspace_id, a.temperature, a.new_temp, a.new_score, NULL,
  'Engagement cap re-applied: ' || a.real_msgs || ' message(s) from the customer'
FROM _apply a
WHERE a.new_temp <> coalesce(a.temperature, '');

-- score_signals is JSONB, so the explanation is prepended as a JSON array
-- element, and only when it isn't already there.
UPDATE leads l
SET ai_score    = a.new_score,
    temperature = a.new_temp,
    score_signals = CASE
      WHEN coalesce(l.score_signals, '[]'::jsonb) @> '["Score capped — too little from the customer to call this hot yet"]'::jsonb
        THEN l.score_signals
      ELSE '["Score capped — too little from the customer to call this hot yet"]'::jsonb
             || coalesce(l.score_signals, '[]'::jsonb)
    END
FROM _apply a
WHERE l.id = a.id;

COMMIT;
