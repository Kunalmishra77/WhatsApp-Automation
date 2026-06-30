-- team_invites: gives the existing "invite member" flow real state to track.
-- Previously POST /api/team/invite only fired a one-off email with zero DB record —
-- there was no way to verify an invite, no token, and accepting it sent the user
-- through normal signup which creates them a BRAND NEW workspace as super_admin
-- instead of joining the inviter's workspace. This table is the missing link.

CREATE TABLE IF NOT EXISTS public.team_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email        VARCHAR(255) NOT NULL,
  role         user_role NOT NULL DEFAULT 'agent',
  token        VARCHAR(64) NOT NULL UNIQUE,
  invited_by   UUID REFERENCES public.profiles(id),
  status       VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | accepted | revoked | expired
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate pending invites to the same email within a workspace.
-- Partial unique index instead of a table-level UNIQUE constraint, since we want
-- this to only apply while status = 'pending' (revoked/accepted/expired rows
-- shouldn't block re-inviting the same email later).
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invites_pending_email
  ON public.team_invites (workspace_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_team_invites_token ON public.team_invites(token);
CREATE INDEX IF NOT EXISTS idx_team_invites_workspace ON public.team_invites(workspace_id);

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- Workspace members can see invites for their workspace (Team page lists them);
-- actual creation/revocation is gated server-side via requireWorkspacePermission
-- ('manage_team'), not relied upon purely at the RLS layer for write operations.
CREATE POLICY team_invites_workspace_isolation ON public.team_invites
  FOR ALL USING (is_workspace_member(workspace_id));
