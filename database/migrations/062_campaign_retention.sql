-- Per-campaign retention lifecycle: tracking columns + atomic delete + notify cron.

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS retention_notified_at timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS data_exported_at     timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS data_deleted_at      timestamptz;

-- Atomic deletion of a campaign's per-recipient data (keeps the campaign tombstone + stats).
-- One plpgsql function = one transaction, so a mid-way failure rolls back entirely.
CREATE OR REPLACE FUNCTION public.delete_campaign_data(p_campaign_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM public.campaign_queue WHERE campaign_id = p_campaign_id;
  DELETE FROM public.campaign_recipients WHERE campaign_id = p_campaign_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  UPDATE public.campaigns SET data_deleted_at = now() WHERE id = p_campaign_id;
  RETURN v_deleted;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_campaign_data(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_campaign_data(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_campaign_data(uuid) FROM authenticated;

-- Notify workspace admins once per campaign that passes its 2-month retention window.
CREATE OR REPLACE FUNCTION public.notify_due_campaign_retention()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  WITH due AS (
    SELECT c.id, c.workspace_id, c.name
    FROM public.campaigns c
    WHERE COALESCE(c.completed_at, c.created_at) + interval '2 months' < now()
      AND c.retention_notified_at IS NULL
      AND c.data_deleted_at IS NULL
  ),
  ins AS (
    INSERT INTO public.notifications (workspace_id, user_id, type, title, body, data)
    SELECT d.workspace_id, m.user_id, 'campaign_retention_due',
           'Campaign "' || COALESCE(d.name, '') || '" data is due for retention',
           'This campaign passed its 2-month retention window. Download or delete its data from the campaign page.',
           jsonb_build_object('campaign_id', d.id)
    FROM due d
    JOIN public.workspace_members m
      ON m.workspace_id = d.workspace_id AND m.role IN ('super_admin', 'admin')
    RETURNING 1
  )
  UPDATE public.campaigns SET retention_notified_at = now()
    WHERE id IN (SELECT id FROM due);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_due_campaign_retention() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_due_campaign_retention() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_due_campaign_retention() FROM authenticated;

-- Daily cron (pure SQL; no HTTP/secret).
SELECT cron.unschedule('campaign-retention-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'campaign-retention-check'
);
SELECT cron.schedule('campaign-retention-check', '0 3 * * *', $$ SELECT public.notify_due_campaign_retention(); $$);
