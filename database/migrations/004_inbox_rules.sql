-- 004_inbox_rules.sql
-- Creates inbox_rules table with workspace-scoped RLS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inbox_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  trigger_type  VARCHAR(50) NOT NULL DEFAULT 'keyword',
  trigger_value JSONB DEFAULT '{}',
  actions       JSONB DEFAULT '[]',
  priority      INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbox_rules_workspace
  ON public.inbox_rules(workspace_id);

CREATE INDEX IF NOT EXISTS idx_inbox_rules_active
  ON public.inbox_rules(workspace_id, is_active);

ALTER TABLE public.inbox_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inbox_rules_workspace_isolation" ON public.inbox_rules;
CREATE POLICY "inbox_rules_workspace_isolation" ON public.inbox_rules
  FOR ALL
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

-- RPC helpers for safe array_append (no duplicate entries)
CREATE OR REPLACE FUNCTION public.append_conversation_label(
  p_conversation_id UUID,
  p_label TEXT
) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.conversations
  SET labels = array_append(
    COALESCE(labels, '{}'),
    p_label
  )
  WHERE id = p_conversation_id
    AND NOT (COALESCE(labels, '{}') @> ARRAY[p_label]);
$$;

CREATE OR REPLACE FUNCTION public.append_contact_tag(
  p_contact_id UUID,
  p_tag TEXT
) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.contacts
  SET tags = array_append(
    COALESCE(tags, '{}'),
    p_tag
  )
  WHERE id = p_contact_id
    AND NOT (COALESCE(tags, '{}') @> ARRAY[p_tag]);
$$;

COMMIT;
