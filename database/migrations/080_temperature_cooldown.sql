-- 080_temperature_cooldown.sql
-- Fix "Cold = 0": lead temperature was UPGRADE-ONLY (keyword/message-count heat-up,
-- never cools), so leads drift to 'hot' and never come down — Cold never appears.
-- This adds a recency-based cool-down (only ever DOWNGRADES; the existing heat-up
-- logic still promotes a lead the moment the customer re-engages), so hot/warm/cold
-- reflects real current engagement. Runs every 6 hours + backfills now.

CREATE OR REPLACE FUNCTION public.cool_down_lead_temperature() RETURNS void LANGUAGE sql AS $$
  WITH last_in AS (
    SELECT l.id AS lead_id, l.temperature,
      (SELECT max(m.created_at) FROM public.messages m
         WHERE m.conversation_id = l.conversation_id AND m.direction = 'inbound') AS last_inbound
    FROM public.leads l
    WHERE l.conversation_id IS NOT NULL
      AND l.stage NOT IN ('converted','lost')
  ),
  target AS (
    SELECT lead_id, temperature,
      CASE
        -- Silent for 3+ weeks (or never wrote in) → cold.
        WHEN last_inbound IS NULL OR last_inbound < now() - interval '21 days' THEN 'cold'
        -- Quiet 10–21 days and still marked hot → step down to warm.
        WHEN last_inbound < now() - interval '10 days' AND temperature = 'hot' THEN 'warm'
        -- Otherwise leave the heat-up logic's value untouched.
        ELSE temperature
      END AS new_temp
    FROM last_in
  )
  UPDATE public.leads l
  SET temperature = target.new_temp, updated_at = now()
  FROM target
  WHERE l.id = target.lead_id
    AND l.temperature IS DISTINCT FROM target.new_temp;
$$;

-- Backfill now.
SELECT public.cool_down_lead_temperature();

-- Keep temperatures honest every 6 hours.
SELECT cron.unschedule('cool-down-temperature')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cool-down-temperature');
SELECT cron.schedule('cool-down-temperature', '50 */6 * * *', $$ SELECT public.cool_down_lead_temperature() $$);
