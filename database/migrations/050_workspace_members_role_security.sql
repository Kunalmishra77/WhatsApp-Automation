-- Fixes a real RLS gap: members_update_admin only checked workspace membership,
-- not the updater's own role — despite its name, ANY member (including the
-- lowest-privilege 'agent') could update ANY other member's row, including
-- promoting themselves or others to admin/super_admin. Confirmed live via
-- pg_policies before this fix: qual was just "workspace_id IN get_my_workspace_ids()".
--
-- Also adds a DELETE policy — there was none, so "remove member" had no RLS
-- path at all (silently blocked, not even on purpose).

DROP POLICY IF EXISTS members_update_admin ON public.workspace_members;
CREATE POLICY members_update_admin ON public.workspace_members
  FOR UPDATE USING (
    workspace_id IN (SELECT get_my_workspace_ids())
    AND get_member_role(workspace_id) IN ('admin', 'super_admin')
  );

CREATE POLICY members_delete_admin ON public.workspace_members
  FOR DELETE USING (
    workspace_id IN (SELECT get_my_workspace_ids())
    AND get_member_role(workspace_id) IN ('admin', 'super_admin')
    AND user_id != auth.uid()  -- can't remove yourself this way
  );
