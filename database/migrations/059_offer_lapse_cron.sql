-- Daily reminder when a workspace's Current Offer has lapsed. Pure SQL (no HTTP)
-- so it does not depend on app.base_url / app.cron_secret. Notifies workspace
-- admins once (guarded by active_offer.lapse_notified), then sets the flag.

SELECT cron.unschedule('offer-lapse-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'offer-lapse-check'
);

SELECT cron.schedule(
  'offer-lapse-check',
  '0 4 * * *',   -- 04:00 UTC daily (~09:30 IST)
  $$
    WITH lapsed AS (
      SELECT w.id,
             w.settings->'active_offer'->>'name'        AS offer_name,
             w.settings->'active_offer'->>'valid_until' AS valid_until
      FROM public.workspaces w
      WHERE w.settings ? 'active_offer'
        AND (w.settings->'active_offer'->>'valid_until') ~ '^\d{4}-\d{2}-\d{2}$'
        AND (w.settings->'active_offer'->>'valid_until')::date < CURRENT_DATE
        AND COALESCE((w.settings->'active_offer'->>'lapse_notified')::boolean, false) = false
    ),
    notify AS (
      INSERT INTO public.notifications (workspace_id, user_id, type, title, body, data)
      SELECT l.id, m.user_id, 'offer_lapsed',
             'Your offer "' || COALESCE(l.offer_name, '') || '" has expired',
             'Set a new Current Offer or the bot will defer pricing to your team.',
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
