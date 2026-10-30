-- 134 — The client hears about an offer BEFORE it stops being quoted.
--
-- Migration 059 schedules `offer-lapse-check`, which notifies admins the day
-- after an offer expires. That is the right notification at the wrong time: by
-- then the bot has already answered a day's price questions from the knowledge
-- base instead of the offer the campaign was advertising, and nobody knew.
--
-- The same job now also warns three days ahead, so there is time to extend the
-- date or set the next offer while the old one is still working. Three days,
-- not seven, because this fires once and should land close enough to the date
-- to still be on someone's mind — the dashboard card covers the wider window
-- (OFFER_ENDING_SOON_DAYS = 7 in lib/offer.ts, which also holds this 3).
--
-- Two flags, two reminders, each sent once:
--   active_offer.lapse_warned   — the three-day warning
--   active_offer.lapse_notified — the it-has-ended notice (059's, unchanged)
-- Saving an offer resets both (app/api/offer/route.ts), so extending a date
-- arms the reminders again for the new one.
--
-- On dates: the job runs at 04:00 UTC, which is 09:30 IST, so CURRENT_DATE here
-- is the same calendar day the client sees. That is why the hour matters and is
-- not a cosmetic choice.

SELECT cron.unschedule('offer-lapse-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'offer-lapse-check'
);

SELECT cron.schedule(
  'offer-lapse-check',
  '0 4 * * *',   -- 04:00 UTC daily (~09:30 IST)
  $$
    -- ── 1. Three days left ───────────────────────────────────────────────────
    WITH lapsing AS (
      SELECT w.id,
             w.settings->'active_offer'->>'name'        AS offer_name,
             w.settings->'active_offer'->>'valid_until' AS valid_until,
             public.try_to_date(w.settings->'active_offer'->>'valid_until') AS ends_on
      FROM public.workspaces w
      WHERE w.settings ? 'active_offer'
        AND public.try_to_date(w.settings->'active_offer'->>'valid_until') IS NOT NULL
        AND public.try_to_date(w.settings->'active_offer'->>'valid_until')
              BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
        -- Not yet started is not "about to end" — it has not begun being quoted.
        AND COALESCE(
              public.try_to_date(w.settings->'active_offer'->>'valid_from'),
              CURRENT_DATE
            ) <= CURRENT_DATE
        AND COALESCE((w.settings->'active_offer'->>'lapse_warned')::boolean, false) = false
    ),
    warn AS (
      INSERT INTO public.notifications (workspace_id, user_id, type, title, body, data)
      SELECT l.id, m.user_id, 'offer_lapsing',
             left(
               'Your offer "' || COALESCE(l.offer_name, '') || '" ends ' ||
               CASE (l.ends_on - CURRENT_DATE)
                 WHEN 0 THEN 'today'
                 WHEN 1 THEN 'tomorrow'
                 ELSE 'in ' || (l.ends_on - CURRENT_DATE) || ' days'
               END || '.', 255),
             'After that the bot stops quoting it and answers price questions from your knowledge base. Extend the end date or set the next offer.',
             jsonb_build_object('valid_until', l.valid_until, 'days_left', l.ends_on - CURRENT_DATE)
      FROM lapsing l
      JOIN public.workspace_members m
        ON m.workspace_id = l.id AND m.role IN ('super_admin', 'admin')
      RETURNING 1
    )
    UPDATE public.workspaces w
    SET settings = jsonb_set(w.settings, '{active_offer,lapse_warned}', 'true'::jsonb)
    WHERE w.id IN (SELECT id FROM lapsing);

    -- ── 2. Already over ──────────────────────────────────────────────────────
    WITH lapsed AS (
      SELECT w.id,
             w.settings->'active_offer'->>'name'        AS offer_name,
             w.settings->'active_offer'->>'valid_until' AS valid_until
      FROM public.workspaces w
      WHERE w.settings ? 'active_offer'
        AND public.try_to_date(w.settings->'active_offer'->>'valid_until') IS NOT NULL
        AND public.try_to_date(w.settings->'active_offer'->>'valid_until') < CURRENT_DATE
        AND COALESCE((w.settings->'active_offer'->>'lapse_notified')::boolean, false) = false
    ),
    notify AS (
      INSERT INTO public.notifications (workspace_id, user_id, type, title, body, data)
      SELECT l.id, m.user_id, 'offer_lapsed',
             left('Your offer "' || COALESCE(l.offer_name, '') || '" has ended.', 255),
             'The bot has stopped quoting it and answers price questions from your knowledge base. Set a new Current Offer or extend this one.',
             jsonb_build_object('valid_until', l.valid_until)
      FROM lapsed l
      JOIN public.workspace_members m
        ON m.workspace_id = l.id AND m.role IN ('super_admin', 'admin')
      RETURNING 1
    )
    UPDATE public.workspaces w
    SET settings = jsonb_set(w.settings, '{active_offer,lapse_notified}', 'true'::jsonb)
    WHERE w.id IN (SELECT id FROM lapsed);
  $$
);

-- Fitness First's Diwali offer ends 2026-11-09 and has never been reminded
-- about, so it is the first real case: the warning lands on 6 November and the
-- ended notice, if nobody acts, on the 10th.
