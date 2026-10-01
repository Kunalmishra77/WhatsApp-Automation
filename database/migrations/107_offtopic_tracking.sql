-- 107_offtopic_tracking.sql
-- Smart off-topic handling: count consecutive off-topic customer messages so the
-- bot can redirect a few times, then auto-pause + flag for review. Reset to 0 on any
-- on-business message. (Abuse is handled immediately via is_blocked, no counter.)

alter table public.conversations
  add column if not exists consecutive_offtopic int not null default 0;

comment on column public.conversations.consecutive_offtopic is 'Running count of consecutive off-topic customer messages; resets to 0 on an on-business message. Drives smart auto-pause.';
