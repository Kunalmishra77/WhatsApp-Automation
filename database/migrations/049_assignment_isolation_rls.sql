-- Assignment-based row isolation for the 'agent' role.
-- Today every workspace member (including 'agent', the lowest-privilege role) can
-- read every conversation/lead/contact/message in the workspace — the existing
-- "*_workspace_isolation" policies only check is_workspace_member(workspace_id),
-- with no regard for who a row is assigned to. The only "Mine" filter was a
-- client-side opt-in tab, trivially bypassed by switching tabs.
--
-- This migration narrows visibility for 'agent'-role members to ONLY rows
-- assigned to them, enforced at the RLS layer so it can't be bypassed from the
-- client. Other roles (super_admin/admin/manager) are unaffected.

CREATE OR REPLACE FUNCTION get_member_role(p_workspace_id uuid)
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION can_view_assigned_row(p_workspace_id uuid, p_assigned_agent_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_workspace_member(p_workspace_id) AND (
    get_member_role(p_workspace_id) IS DISTINCT FROM 'agent'
    OR p_assigned_agent_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION can_view_message_row(p_workspace_id uuid, p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_workspace_member(p_workspace_id) AND (
    get_member_role(p_workspace_id) IS DISTINCT FROM 'agent'
    OR EXISTS (
      SELECT 1 FROM conversations
      WHERE id = p_conversation_id AND assigned_agent_id = auth.uid()
    )
  )
$$;

-- Contact visibility is derived from assigned conversations/leads for that contact,
-- rather than a new assigned_agent_id column on contacts — avoids a denormalized
-- column going stale if a conversation/lead gets reassigned.
CREATE OR REPLACE FUNCTION can_view_contact_row(p_workspace_id uuid, p_contact_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_workspace_member(p_workspace_id) AND (
    get_member_role(p_workspace_id) IS DISTINCT FROM 'agent'
    OR EXISTS (
      SELECT 1 FROM conversations
      WHERE contact_id = p_contact_id AND assigned_agent_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM leads
      WHERE contact_id = p_contact_id AND assigned_agent_id = auth.uid()
    )
  )
$$;

-- ── Replace workspace-wide policies with assignment-aware ones ──────────────

DROP POLICY IF EXISTS conversations_workspace_isolation ON public.conversations;
CREATE POLICY conversations_workspace_isolation ON public.conversations
  FOR ALL USING (can_view_assigned_row(workspace_id, assigned_agent_id));

DROP POLICY IF EXISTS leads_workspace_isolation ON public.leads;
CREATE POLICY leads_workspace_isolation ON public.leads
  FOR ALL USING (can_view_assigned_row(workspace_id, assigned_agent_id));

DROP POLICY IF EXISTS messages_workspace_isolation ON public.messages;
CREATE POLICY messages_workspace_isolation ON public.messages
  FOR ALL USING (can_view_message_row(workspace_id, conversation_id));

DROP POLICY IF EXISTS contacts_workspace_isolation ON public.contacts;
CREATE POLICY contacts_workspace_isolation ON public.contacts
  FOR ALL USING (can_view_contact_row(workspace_id, id));
