-- Fix: Conversations page wasn't updating live with new messages.
-- Supabase Realtime's postgres_changes authorization re-checks RLS policies against
-- WAL row data. With REPLICA IDENTITY default (primary key only), RLS-protected
-- tables can silently drop change events instead of delivering them to subscribers.
-- REPLICA IDENTITY FULL includes all columns in the WAL so the RLS check
-- (is_workspace_member(workspace_id)) has what it needs to evaluate correctly.

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
