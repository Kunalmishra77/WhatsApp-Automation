-- 114 — Re-apply the engagement cap using each client's OWN bands.
--
-- Migration 113 used fixed ceilings (45 for one message, 60 for two). That works
-- only for a workspace whose Hot threshold sits above 60. Clients run from hot=55
-- (Razorveda, Thames Wellness) to hot=66 (Santure, VMS), so Razorveda's
-- two-message leads stayed Hot at a capped score of 60 — the fix missed the very
-- client that reported the problem.
--
-- engagementCap() in lib/lead-classifier.ts is now expressed relative to the
-- workspace's thresholds, and this applies the same relative curve to leads that
-- were already scored. Cools only, same as 113, and for the same reason: scores
-- from the 05-06 Oct classifier are unreliable and ~1,300 leads had their
-- temperature corrected by hand without the score being lowered.

BEGIN;

CREATE TEMP TABLE _recap2 AS
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
    (SELECT count(*) FROM messages m
      WHERE m.conversation_id = l.conversation_id AND m.direction = 'inbound'
        AND coalesce(btrim(m.content),'') <> ''
        AND m.content NOT LIKE '⚠️%'
        AND NOT EXISTS (
          SELECT 1 FROM trusted t
          WHERE t.workspace_id = l.workspace_id
            AND (public.prefill_norm(m.content) = t.ntext
              OR (length(t.ntext) >= 25 AND starts_with(public.prefill_norm(m.content), t.ntext)))
        )
    )::int AS real_msgs
  FROM leads l
  WHERE l.ai_score IS NOT NULL AND l.stage <> 'converted'
)
SELECT c.id, c.workspace_id, c.ai_score, c.temperature, c.real_msgs, t.hot, t.warm,
  least(c.ai_score, CASE
    WHEN c.real_msgs <= 0 THEN greatest(0, t.warm - 1)
    WHEN c.real_msgs <= 2 THEN greatest(t.warm, t.hot - 1)
    WHEN c.real_msgs <= 4 THEN 85
    ELSE 100 END) AS new_score
FROM counts c JOIN th t ON t.workspace_id = c.workspace_id;

CREATE INDEX ON _recap2 (id);

CREATE TEMP TABLE _apply2 AS
SELECT r.*,
  CASE WHEN r.new_score >= r.hot THEN 'hot'
       WHEN r.new_score >= r.warm THEN 'warm'
       ELSE 'cold' END AS new_temp
FROM _recap2 r;

-- Never promote, and only keep rows where something actually changes.
DELETE FROM _apply2
WHERE NOT (
  (CASE new_temp WHEN 'hot' THEN 3 WHEN 'warm' THEN 2 ELSE 1 END)
  <= (CASE coalesce(temperature,'cold') WHEN 'hot' THEN 3 WHEN 'warm' THEN 2 ELSE 1 END)
  AND (new_score < ai_score OR new_temp <> coalesce(temperature,''))
);

INSERT INTO public.lead_score_history (lead_id, workspace_id, from_temperature, to_temperature, score, reason)
SELECT a.id, a.workspace_id, a.temperature, a.new_temp, a.new_score,
  'Engagement cap re-applied against this workspace''s own bands: '
    || a.real_msgs || ' message(s) from the customer'
FROM _apply2 a
WHERE a.new_temp <> coalesce(a.temperature, '');

UPDATE leads l
SET ai_score    = a.new_score,
    temperature = a.new_temp,
    score_signals = CASE
      WHEN coalesce(l.score_signals, '[]'::jsonb) @> '["Score capped — too little from the customer to call this hot yet"]'::jsonb
        THEN l.score_signals
      ELSE '["Score capped — too little from the customer to call this hot yet"]'::jsonb
             || coalesce(l.score_signals, '[]'::jsonb)
    END
FROM _apply2 a
WHERE l.id = a.id;

COMMIT;
