-- ════════════════════════════════════════════════════════════════════════════
-- 110 — Advanced team portal: configurable roles, per-member access,
--       client ownership, and a real activity trail.
--
-- Background: workspace_members only ever held a fixed `role` enum, so an admin
-- could not shape what an individual employee may do. Page access existed but
-- lived in workspaces.settings as ONE list shared by every agent. And the
-- activity table was written by three endpoints out of hundreds, while the
-- audit-log API read it — so the audit trail was effectively empty.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Activity trail ───────────────────────────────────────────────────────
-- entity_id was NOT NULL, which made workspace-level events (a settings change,
-- an invite, a role change) impossible to record — there is no row they point at.
ALTER TABLE public.activities ALTER COLUMN entity_id DROP NOT NULL;

-- Free-text label captured at write time so the trail stays readable after the
-- entity it refers to is deleted.
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS entity_label TEXT;

-- The actor's IP / client, for the security half of the audit trail.
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS ip_address  TEXT;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS user_agent  TEXT;

CREATE INDEX IF NOT EXISTS idx_activities_actor
  ON public.activities(workspace_id, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_action
  ON public.activities(workspace_id, action, created_at DESC);

-- ── 2. Configurable roles ───────────────────────────────────────────────────
-- A workspace-defined role: a named permission set an admin can build and
-- assign, instead of being limited to the four built-in enum values.
CREATE TABLE IF NOT EXISTS public.workspace_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(80) NOT NULL,
  description  TEXT,
  -- Permission keys from types/auth.types.ts Permission union.
  permissions  TEXT[] NOT NULL DEFAULT '{}',
  -- Page keys from lib/agent-pages.ts. NULL = inherit the workspace default.
  page_access  TEXT[],
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_workspace_roles_ws ON public.workspace_roles(workspace_id);

ALTER TABLE public.workspace_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_roles_workspace" ON public.workspace_roles;
CREATE POLICY "workspace_roles_workspace" ON public.workspace_roles
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- ── 3. Per-member access and profile ────────────────────────────────────────
ALTER TABLE public.workspace_members
  -- Job title shown on the member's profile.
  ADD COLUMN IF NOT EXISTS title           VARCHAR(120),
  -- Assigned custom role. NULL = use the built-in `role` enum.
  ADD COLUMN IF NOT EXISTS custom_role_id  UUID REFERENCES public.workspace_roles(id) ON DELETE SET NULL,
  -- Per-member page access. NULL = fall back to the role / workspace default,
  -- so every existing member keeps exactly the access they have today.
  ADD COLUMN IF NOT EXISTS page_access     TEXT[],
  -- Individual tweaks on top of the resolved role: { "grant": [], "revoke": [] }.
  ADD COLUMN IF NOT EXISTS permission_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Suspend access without deleting the member or losing their history.
  ADD COLUMN IF NOT EXISTS is_suspended    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_active_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invited_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_members_custom_role
  ON public.workspace_members(custom_role_id) WHERE custom_role_id IS NOT NULL;

-- ── 4. Client ↔ team link ───────────────────────────────────────────────────
-- Which team member owns this client. Pairs with the member profile's
-- "Clients" list so the link reads correctly from both ends.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_owner
  ON public.contacts(workspace_id, owner_id) WHERE owner_id IS NOT NULL;
