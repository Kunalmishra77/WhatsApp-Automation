-- ════════════════════════════════════════════════════════
-- 002_core_domain.sql
-- Agentix core domain tables: contacts, conversations, messages,
-- leads, templates, campaigns, notifications, activities
-- ════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE conversation_status  AS ENUM ('open','assigned','resolved','pending','snoozed');   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE message_type         AS ENUM ('text','image','video','audio','document','location','sticker','interactive','template','internal_note'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE message_status       AS ENUM ('queued','sent','delivered','read','failed');         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE message_direction    AS ENUM ('inbound','outbound');                                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE lead_stage           AS ENUM ('new','contacted','follow_up','interested','converted','lost'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE campaign_status      AS ENUM ('draft','scheduled','running','paused','completed','failed');  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE template_status      AS ENUM ('pending','approved','rejected','paused');            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE template_category    AS ENUM ('authentication','marketing','utility');              EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────
-- CONTACTS
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  phone         VARCHAR(50) NOT NULL,
  name          VARCHAR(255),
  email         VARCHAR(255),
  avatar_url    TEXT,
  company       VARCHAR(255),
  country       VARCHAR(100),
  language      VARCHAR(10) DEFAULT 'en',
  tags          TEXT[]  DEFAULT '{}',
  custom_fields JSONB   DEFAULT '{}',
  is_blocked    BOOLEAN DEFAULT false,
  opted_out     BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, phone)
);

-- ────────────────────────────────────────────────────────
-- CONVERSATIONS
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id        UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  assigned_agent_id UUID REFERENCES public.profiles(id),
  status            conversation_status DEFAULT 'open',
  channel           VARCHAR(50) DEFAULT 'whatsapp',
  subject           TEXT,
  last_message      TEXT,
  last_message_at   TIMESTAMPTZ,
  unread_count      INTEGER DEFAULT 0,
  labels            TEXT[]  DEFAULT '{}',
  is_pinned         BOOLEAN DEFAULT false,
  is_starred        BOOLEAN DEFAULT false,
  snoozed_until     TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  meta              JSONB   DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────
-- MESSAGES
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sender_type     VARCHAR(20) NOT NULL,
  sender_id       UUID,
  direction       message_direction NOT NULL,
  type            message_type      NOT NULL DEFAULT 'text',
  content         TEXT,
  media_url       TEXT,
  media_mime_type VARCHAR(100),
  media_size      INTEGER,
  media_filename  TEXT,
  caption         TEXT,
  whatsapp_msg_id VARCHAR(255),
  status          message_status DEFAULT 'queued',
  is_deleted      BOOLEAN DEFAULT false,
  reply_to_id     UUID REFERENCES public.messages(id),
  reactions       JSONB DEFAULT '{}',
  metadata        JSONB DEFAULT '{}',
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────
-- LEADS (CRM)
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id        UUID REFERENCES public.contacts(id),
  conversation_id   UUID REFERENCES public.conversations(id),
  assigned_agent_id UUID REFERENCES public.profiles(id),
  title             VARCHAR(255) NOT NULL,
  stage             lead_stage DEFAULT 'new',
  value             DECIMAL(12,2),
  currency          VARCHAR(10) DEFAULT 'USD',
  priority          VARCHAR(20) DEFAULT 'medium',
  source            VARCHAR(100),
  notes             TEXT,
  tags              TEXT[]  DEFAULT '{}',
  custom_fields     JSONB   DEFAULT '{}',
  follow_up_at      TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────
-- TEMPLATES
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  category         template_category NOT NULL,
  language         VARCHAR(10) DEFAULT 'en',
  status           template_status DEFAULT 'pending',
  header_type      VARCHAR(20),
  header_content   TEXT,
  body             TEXT NOT NULL,
  footer           TEXT,
  buttons          JSONB  DEFAULT '[]',
  variables        TEXT[] DEFAULT '{}',
  meta_template_id VARCHAR(255),
  rejection_reason TEXT,
  created_by       UUID REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────
-- CAMPAIGNS
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  template_id      UUID REFERENCES public.templates(id),
  status           campaign_status DEFAULT 'draft',
  audience_type    VARCHAR(50),
  audience_filter  JSONB DEFAULT '{}',
  total_recipients INTEGER DEFAULT 0,
  sent_count       INTEGER DEFAULT 0,
  delivered_count  INTEGER DEFAULT 0,
  read_count       INTEGER DEFAULT 0,
  failed_count     INTEGER DEFAULT 0,
  scheduled_at     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_by       UUID REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type         VARCHAR(100) NOT NULL,
  title        VARCHAR(255) NOT NULL,
  body         TEXT,
  data         JSONB   DEFAULT '{}',
  is_read      BOOLEAN DEFAULT false,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────
-- ACTIVITIES (audit log)
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id     UUID REFERENCES public.profiles(id),
  entity_type  VARCHAR(100) NOT NULL,
  entity_id    UUID NOT NULL,
  action       VARCHAR(100) NOT NULL,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_contacts_workspace         ON public.contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone             ON public.contacts(workspace_id, phone);
CREATE INDEX IF NOT EXISTS idx_contacts_tags              ON public.contacts USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_contacts_fts               ON public.contacts USING gin(to_tsvector('english', coalesce(name,'') || ' ' || phone));

CREATE INDEX IF NOT EXISTS idx_conversations_ws_status    ON public.conversations(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_contact      ON public.conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent        ON public.conversations(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg     ON public.conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_fts          ON public.conversations USING gin(to_tsvector('english', coalesce(last_message,'')));

CREATE INDEX IF NOT EXISTS idx_messages_conversation      ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id       ON public.messages(whatsapp_msg_id) WHERE whatsapp_msg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_workspace         ON public.messages(workspace_id);

CREATE INDEX IF NOT EXISTS idx_leads_workspace_stage      ON public.leads(workspace_id, stage);
CREATE INDEX IF NOT EXISTS idx_leads_agent                ON public.leads(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_contact              ON public.leads(contact_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_ws_status        ON public.campaigns(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread  ON public.notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_entity          ON public.activities(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activities_workspace       ON public.activities(workspace_id, created_at DESC);

-- ════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════

ALTER TABLE public.contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities     ENABLE ROW LEVEL SECURITY;

-- Shared helper: workspace membership check
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  )
$$;

DROP POLICY IF EXISTS "contacts_workspace_isolation"      ON public.contacts;
CREATE POLICY "contacts_workspace_isolation" ON public.contacts
  FOR ALL USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "conversations_workspace_isolation" ON public.conversations;
CREATE POLICY "conversations_workspace_isolation" ON public.conversations
  FOR ALL USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "conversations_agent_update"        ON public.conversations;
CREATE POLICY "conversations_agent_update" ON public.conversations
  FOR UPDATE USING (
    public.is_workspace_member(workspace_id) AND (
      assigned_agent_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE user_id = auth.uid()
          AND workspace_id = conversations.workspace_id
          AND role IN ('super_admin','admin','manager')
      )
    )
  );

DROP POLICY IF EXISTS "messages_workspace_isolation"      ON public.messages;
CREATE POLICY "messages_workspace_isolation" ON public.messages
  FOR ALL USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "leads_workspace_isolation"         ON public.leads;
CREATE POLICY "leads_workspace_isolation" ON public.leads
  FOR ALL USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "templates_workspace_isolation"     ON public.templates;
CREATE POLICY "templates_workspace_isolation" ON public.templates
  FOR ALL USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "campaigns_workspace_isolation"     ON public.campaigns;
CREATE POLICY "campaigns_workspace_isolation" ON public.campaigns
  FOR ALL USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "notifications_own"                 ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "activities_workspace_isolation"    ON public.activities;
CREATE POLICY "activities_workspace_isolation" ON public.activities
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- ════════════════════════════════════════════════════════
-- AUTO-UPDATE updated_at TRIGGERS
-- ════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER contacts_updated_at      BEFORE UPDATE ON public.contacts      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER leads_updated_at         BEFORE UPDATE ON public.leads         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER templates_updated_at     BEFORE UPDATE ON public.templates     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER campaigns_updated_at     BEFORE UPDATE ON public.campaigns     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ════════════════════════════════════════════════════════
-- AUTO-UPDATE conversation last_message ON new message INSERT
-- ════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE public.conversations
    SET
      last_message    = LEFT(COALESCE(NEW.content,'[media]'), 200),
      last_message_at = NEW.created_at,
      unread_count    = unread_count + 1,
      updated_at      = NOW()
    WHERE id = NEW.conversation_id;
  ELSE
    UPDATE public.conversations
    SET
      last_message    = LEFT(COALESCE(NEW.content,'[media]'), 200),
      last_message_at = NEW.created_at,
      updated_at      = NOW()
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_update_conversation ON public.messages;
CREATE TRIGGER messages_update_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();
