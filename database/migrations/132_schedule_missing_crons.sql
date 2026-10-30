-- 132 — Schedule two jobs that nothing was running.
--
-- There are twenty-one cron jobs on this database and neither of these was
-- among them.
--
-- time-triggers
--   Processes time_trigger_queue: idle-conversation auto-close, scheduled
--   sends — and, since migration 122's successor shipped, the flow Wait node
--   and every question timeout. The route and the queue both existed and
--   nothing called them, so a flow that reached a Wait node would have parked
--   forever and no "if they don't reply in 48 hours" branch could ever fire.
--   That is a gap in work already shipped, not a new feature.
--   Every minute: a two-hour follow-up should not land twenty minutes late,
--   and the route reads at most 100 due rows a run.
--
-- sync-template-status
--   Carries Meta's approval decision back into the platform. /api/templates/sync
--   needs a signed-in user with manage_templates, so statuses only refreshed
--   when somebody opened the Templates page. A template submitted on Tuesday
--   stayed 'pending' here until someone looked, which is most of why clients
--   concluded the platform could not get a template approved. V4you's
--   gym_plateform sat at 'pending' for two days with updated_at still equal to
--   created_at.
--   Every fifteen minutes: Meta takes minutes to hours, and the job is one
--   Graph call per workspace.
--
-- Both routes authenticate with ?secret=<CRON_SECRET>. That value is not
-- written here: it is read out of an existing job's command, so this migration
-- carries no secret of its own and cannot drift from the one in use. app.* GUCs
-- are not settable over the pooler, which is why every job inlines it.

DO $$
DECLARE
  cron_secret text;
  base_url    text := 'https://app.aiagentixdev.com';
BEGIN
  -- sla-breach-check is the existing GET-style job, so its command holds the
  -- secret in the same ?secret=<value> form these two need.
  SELECT substring(command from 'secret=([A-Za-z0-9_\-]+)')
    INTO cron_secret
  FROM cron.job
  WHERE jobname = 'sla-breach-check'
  LIMIT 1;

  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE EXCEPTION
      'Could not read CRON_SECRET from the sla-breach-check job. Schedule these two by hand rather than guessing the secret.';
  END IF;

  PERFORM cron.schedule(
    'time-triggers',
    '* * * * *',
    format(
      'SELECT net.http_get(url := %L) AS request_id;',
      base_url || '/api/cron/time-triggers?secret=' || cron_secret
    )
  );

  PERFORM cron.schedule(
    'sync-template-status',
    '*/15 * * * *',
    format(
      'SELECT net.http_get(url := %L) AS request_id;',
      base_url || '/api/cron/sync-template-status?secret=' || cron_secret
    )
  );
END $$;
