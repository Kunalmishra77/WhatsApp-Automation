-- ════════════════════════════════════════════════════════
-- 001_auth_workspace.sql — Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════════════

-- ENUMS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'manager', 'agent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────
-- TABLES (create all before any cross-referencing policies)
-- ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    VARCHAR(255) NOT NULL DEFAULT '',
  email        VARCHAR(255) UNIQUE NOT NULL,
  avatar_url   TEXT,
  phone        VARCHAR(50),
  timezone     VARCHAR(100) DEFAULT 'UTC',
  preferences  JSONB DEFAULT '{}',
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspaces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,
  logo_url        TEXT,
  plan            VARCHAR(50) DEFAULT 'starter',
  waba_id         VARCHAR(255),
  phone_number_id VARCHAR(255),
  access_token    TEXT,
  webhook_secret  VARCHAR(255),
  settings        JSONB DEFAULT '{}',
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         user_role NOT NULL DEFAULT 'agent',
  is_online    BOOLEAN DEFAULT false,
  max_chats    INTEGER DEFAULT 10,
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- ────────────────────────────────────────────────────────
-- INDEXES
-- ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_workspace_members_user      ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON public.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email              ON public.profiles(email);

-- ────────────────────────────────────────────────────────
-- AUTO-CREATE PROFILE TRIGGER
-- ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ────────────────────────────────────────────────────────
-- RLS — Enable on all tables
-- ────────────────────────────────────────────────────────
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- profiles: owner can do everything
DROP POLICY IF EXISTS "profiles_owner" ON public.profiles;
CREATE POLICY "profiles_owner" ON public.profiles
  FOR ALL USING (id = auth.uid());

-- workspaces: members can read their own workspaces
DROP POLICY IF EXISTS "workspaces_member_read" ON public.workspaces;
CREATE POLICY "workspaces_member_read" ON public.workspaces
  FOR SELECT USING (
    id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- workspaces: admins can update
DROP POLICY IF EXISTS "workspaces_admin_write" ON public.workspaces;
CREATE POLICY "workspaces_admin_write" ON public.workspaces
  FOR UPDATE USING (
    id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- workspace_members: anyone can insert their own membership (for workspace creation)
DROP POLICY IF EXISTS "members_insert_own" ON public.workspace_members;
CREATE POLICY "members_insert_own" ON public.workspace_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- workspace_members: see all members of workspaces you belong to
DROP POLICY IF EXISTS "members_workspace_isolation" ON public.workspace_members;
CREATE POLICY "members_workspace_isolation" ON public.workspace_members
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members wm2 WHERE wm2.user_id = auth.uid()
    )
  );
