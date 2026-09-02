-- 083_grace_reminder_tracking.sql
-- Daily grace-period countdown reminders: while a subscription is past_due and
-- inside its grace window, the sweep sends one reminder per day ("N day(s) to
-- suspend"). This column dedupes same-day sends, mirroring reminder_sent_for.

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS grace_reminder_sent_for date;
