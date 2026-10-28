-- 126 — Index the foreign keys that are actually hot.
--
-- 53 foreign-key columns in this schema have no supporting index. Postgres does
-- not create one for a FK, and without it every parent delete or update has to
-- scan the child table, as does any join or filter on that column.
--
-- Most of the 53 are on tables with a handful of rows, where a sequential scan
-- is the faster plan anyway and an index would only cost write time. These eight
-- are the ones worth paying for:
--
--   campaign_recipients.conversation_id — 403,996 rows and 149 MB, with 5,941
--     sequential scans recorded. Every one of those read the whole table. This
--     is the single clearest win in the schema.
--   lead_stage_history.workspace_id     — 13,218 rows, and every row is
--     workspace-scoped, so any read of it filters on this column.
--   marketing_touchpoints.lead_id /     — 5,868 rows, joined per lead on the
--                        .contact_id      attribution and ROI screens.
--   conversation_events.conversation_id — 1,886 rows and growing per event; read
--     by conversation every time a thread is opened.
--   tasks.related_conversation_id /     — empty today, and about to stop being:
--        .assigned_to                     the new flow Action node creates tasks
--                                         and assigns them.
--   time_trigger_queue.contact_id       — also empty today. The new Wait node
--     and question timeouts both queue rows here, and the cron reads the queue
--     every run.
--
-- Plain CREATE INDEX rather than CONCURRENTLY: run-migration.mjs sends the file
-- as one multi-statement query, which Postgres runs in an implicit transaction,
-- and CONCURRENTLY cannot run inside one. The largest table here is 404k rows,
-- so the write lock is seconds, not minutes.

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_conversation
  ON public.campaign_recipients (conversation_id);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_workspace
  ON public.lead_stage_history (workspace_id);

CREATE INDEX IF NOT EXISTS idx_marketing_touchpoints_lead
  ON public.marketing_touchpoints (lead_id);

CREATE INDEX IF NOT EXISTS idx_marketing_touchpoints_contact
  ON public.marketing_touchpoints (contact_id);

CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation
  ON public.conversation_events (conversation_id);

CREATE INDEX IF NOT EXISTS idx_tasks_related_conversation
  ON public.tasks (related_conversation_id);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to
  ON public.tasks (assigned_to);

CREATE INDEX IF NOT EXISTS idx_time_trigger_queue_contact
  ON public.time_trigger_queue (contact_id);

-- The queue's own hot read is "pending rows that are due", which the cron runs
-- every minute and which the Wait node now depends on.
CREATE INDEX IF NOT EXISTS idx_time_trigger_queue_due
  ON public.time_trigger_queue (trigger_at)
  WHERE status = 'pending';
