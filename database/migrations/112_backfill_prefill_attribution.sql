-- 112 — Learn pre-fills from past referrals, then recover the ad leads that
--       Meta never sent a referral for.
--
-- Migration 111 made attribution self-healing going forward. This applies the
-- same idea backwards: every conversation Meta DID attribute tells us what that
-- ad's pre-filled opening looks like, and once we know the text we can recognise
-- the conversations Meta stayed silent about.
--
-- Razorveda alone had 75 conversations opening with the exact ad text that was
-- attributed 129 other times, plus 48 more on a second ad — all invisible on the
-- Meta Leads page because nothing had tagged them.
--
-- Additive only: this inserts pre-fill rows and sets meta/labels on conversations.

-- Comparison form, matching lib/meta-prefill.ts normalisePrefill(): case-folded,
-- curly quotes straightened, leading emoji/punctuation stripped, spaces collapsed.
CREATE OR REPLACE FUNCTION public.prefill_norm(t TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        lower(translate(t, U&'\2018\2019\02BC\201C\201D\2013\2014', '''''''""--')),
        '^[^[:alnum:]''"]+', '', ''
      ),
      '\s+', ' ', 'g'
    )
  );
$fn$;

-- Ad headlines Meta reports are longer than the original VARCHAR(100) allowed.
ALTER TABLE public.meta_ad_prefill_messages
  ALTER COLUMN template_name TYPE TEXT;

BEGIN;

-- 1. Learn the pre-fill text of every ad Meta attributed.
WITH referral_openings AS (
  SELECT
    cv.workspace_id,
    (SELECT m.content
       FROM messages m
      WHERE m.conversation_id = cv.id AND m.direction = 'inbound'
      ORDER BY m.created_at
      LIMIT 1) AS txt,
    cv.meta->'ad_source'->>'headline' AS headline
  FROM conversations cv
  WHERE cv.meta->'ad_source'->>'source' = 'referral'
),
candidates AS (
  SELECT
    workspace_id,
    txt,
    max(headline)  AS headline,
    count(*)::int  AS cnt
  FROM referral_openings
  WHERE txt IS NOT NULL
    -- Same guards as isLearnablePrefill(): long enough, at least three words,
    -- not one of our own placeholders, not a bare link.
    AND length(public.prefill_norm(txt)) >= 12
    AND array_length(regexp_split_to_array(public.prefill_norm(txt), ' '), 1) >= 3
    AND public.prefill_norm(txt) NOT LIKE '[%]'
    AND public.prefill_norm(txt) NOT LIKE 'http%'
    AND public.prefill_norm(txt) NOT LIKE '%whatsapp couldn''t read%'
  GROUP BY workspace_id, txt
)
INSERT INTO public.meta_ad_prefill_messages
  (workspace_id, text, template_name, auto_learned, learned_from_ad, seen_count, last_seen_at)
SELECT workspace_id, txt, coalesce(headline, 'Meta Ad'), true, headline, cnt, NOW()
FROM candidates
ON CONFLICT (workspace_id, text) DO UPDATE
  SET seen_count   = GREATEST(public.meta_ad_prefill_messages.seen_count, EXCLUDED.seen_count),
      last_seen_at = NOW();

-- 2. Attribute the conversations Meta never told us about.
-- Only pre-fills seen at least twice are trusted, exactly as the webhook does.
WITH trusted AS (
  SELECT workspace_id, public.prefill_norm(text) AS ntext, template_name
  FROM public.meta_ad_prefill_messages
  WHERE NOT auto_learned OR seen_count >= 2
),
untagged AS (
  SELECT cv.id, cv.workspace_id, cv.meta, cv.labels,
    public.prefill_norm(
      (SELECT m.content FROM messages m
        WHERE m.conversation_id = cv.id AND m.direction = 'inbound'
        ORDER BY m.created_at LIMIT 1)
    ) AS opening
  FROM conversations cv
  WHERE cv.meta->'ad_source' IS NULL
),
matched AS (
  SELECT DISTINCT ON (u.id)
    u.id, u.workspace_id, u.meta, u.labels, t.template_name
  FROM untagged u
  JOIN trusted t ON t.workspace_id = u.workspace_id
  WHERE u.opening IS NOT NULL
    AND length(u.opening) >= 12
    AND (
      u.opening = t.ntext
      -- Meta truncates long pre-fills in the composer, so the same ad can arrive
      -- whole or cut short. Demand a substantial overlap so short texts can't collide.
      OR (length(t.ntext)   >= 25 AND starts_with(u.opening, t.ntext))
      OR (length(u.opening) >= 25 AND starts_with(t.ntext, u.opening))
    )
  ORDER BY u.id, length(t.ntext) DESC
)
UPDATE conversations cv
SET meta = coalesce(cv.meta, '{}'::jsonb) || jsonb_build_object(
      'ad_source', jsonb_build_object(
        'headline',    m.template_name,
        'platform',    'facebook',
        'detected_at', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'source',      'prefill_backfill'
      )
    ),
    labels = CASE
      WHEN coalesce(cv.labels, '{}') @> ARRAY['Meta Ad Lead'] THEN cv.labels
      ELSE array_append(coalesce(cv.labels, '{}'), 'Meta Ad Lead')
    END
FROM matched m
WHERE cv.id = m.id;

-- The Meta Leads page filters on the label, so every workspace that just gained
-- one needs the label present in its own label list.
INSERT INTO public.workspace_labels (workspace_id, name, color)
SELECT DISTINCT cv.workspace_id, 'Meta Ad Lead', 'blue'
FROM conversations cv
WHERE cv.labels @> ARRAY['Meta Ad Lead']
ON CONFLICT (workspace_id, name) DO NOTHING;

COMMIT;
