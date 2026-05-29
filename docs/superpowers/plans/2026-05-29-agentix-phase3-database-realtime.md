# Agentix Phase 3 — Database Schema + Realtime Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete production database schema (contacts, conversations, messages, leads, templates, campaigns, notifications, activities) with all ENUMs, RLS policies, and performance indexes — then wire Supabase Realtime into typed hooks usable by the conversation module.

**Architecture:** SQL migration `002_core_domain.sql` adds all domain tables in dependency order; a `run-migration.mjs` Node script applies it directly to Supabase via the transaction pooler. `types/database.types.ts` is updated to reflect all tables. `hooks/useRealtime.ts` wraps the existing channel registry into a React hook that subscribes to postgres_changes events with automatic cleanup. A `hooks/usePresence.ts` tracks agent online status via Supabase Presence.

**Tech Stack:** PostgreSQL 15 (Supabase), @supabase/supabase-js Realtime, TypeScript strict, Next.js 15 App Router hooks ('use client').

---

## File Map

### New files
```
database/migrations/002_core_domain.sql         — contacts, conversations, messages, leads, templates, campaigns, notifications, activities + all ENUMs, indexes, RLS
hooks/useRealtime.ts                            — typed postgres_changes subscription hook with cleanup
hooks/usePresence.ts                            — agent online-status tracking via Supabase Presence
hooks/useNotifications.ts                       — real-time notification badge counter hook
```

### Modified files
```
database/run-migration.mjs                      — point to 002_core_domain.sql
types/database.types.ts                         — add all new table Row/Insert/Update types
realtime/channels.ts                            — already complete; verified against new tables
```

---

## Task 1: Core Domain SQL Migration

**Files:**
- Create: `d:\WhatsApp-Automation\database\migrations\002_core_domain.sql`

- [ ] **Step 1: Write the migration SQL**

Write `d:\WhatsApp-Automation\database\migrations\002_core_domain.sql`:

```sql
-- ════════════════════════════════════════════════════════
-- 002_core_domain.sql
-- Agentix core domain tables: contacts, conversations, messages,
-- leads, templates, campaigns, notifications, activities
-- ════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE conversation_status  AS ENUM ('open','assigned','resolved','pending','snoozed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE message_type         AS ENUM ('text','image','video','audio','document','location','sticker','interactive','template','internal_note'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE message_status       AS ENUM ('queued','sent','delivered','read','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE message_direction    AS ENUM ('inbound','outbound'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE lead_stage           AS ENUM ('new','contacted','follow_up','interested','converted','lost'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE campaign_status      AS ENUM ('draft','scheduled','running','paused','completed','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE template_status      AS ENUM ('pending','approved','rejected','paused'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE template_category    AS ENUM ('authentication','marketing','utility'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────
-- CONTACTS
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  phone           VARCHAR(50) NOT NULL,
  name            VARCHAR(255),
  email           VARCHAR(255),
  avatar_url      TEXT,
  company         VARCHAR(255),
  country         VARCHAR(100),
  language        VARCHAR(10) DEFAULT 'en',
  tags            TEXT[]   DEFAULT '{}',
  custom_fields   JSONB    DEFAULT '{}',
  is_blocked      BOOLEAN  DEFAULT false,
  opted_out       BOOLEAN  DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, phone)
);

-- ────────────────────────────────────────────────────────
-- CONVERSATIONS
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  assigned_agent_id   UUID REFERENCES public.profiles(id),
  status              conversation_status DEFAULT 'open',
  channel             VARCHAR(50) DEFAULT 'whatsapp',
  subject             TEXT,
  last_message        TEXT,
  last_message_at     TIMESTAMPTZ,
  unread_count        INTEGER DEFAULT 0,
  labels              TEXT[]   DEFAULT '{}',
  is_pinned           BOOLEAN  DEFAULT false,
  is_starred          BOOLEAN  DEFAULT false,
  snoozed_until       TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  meta                JSONB    DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────
-- MESSAGES
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sender_type         VARCHAR(20) NOT NULL,
  sender_id           UUID,
  direction           message_direction NOT NULL,
  type                message_type      NOT NULL DEFAULT 'text',
  content             TEXT,
  media_url           TEXT,
  media_mime_type     VARCHAR(100),
  media_size          INTEGER,
  media_filename      TEXT,
  caption             TEXT,
  whatsapp_msg_id     VARCHAR(255),
  status              message_status DEFAULT 'queued',
  is_deleted          BOOLEAN DEFAULT false,
  reply_to_id         UUID REFERENCES public.messages(id),
  reactions           JSONB DEFAULT '{}',
  metadata            JSONB DEFAULT '{}',
  delivered_at        TIMESTAMPTZ,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────
-- LEADS (CRM)
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES public.contacts(id),
  conversation_id     UUID REFERENCES public.conversations(id),
  assigned_agent_id   UUID REFERENCES public.profiles(id),
  title               VARCHAR(255) NOT NULL,
  stage               lead_stage DEFAULT 'new',
  value               DECIMAL(12,2),
  currency            VARCHAR(10) DEFAULT 'USD',
  priority            VARCHAR(20) DEFAULT 'medium',
  source              VARCHAR(100),
  notes               TEXT,
  tags                TEXT[]  DEFAULT '{}',
  custom_fields       JSONB   DEFAULT '{}',
  follow_up_at        TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────
-- TEMPLATES
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  category            template_category NOT NULL,
  language            VARCHAR(10) DEFAULT 'en',
  status              template_status DEFAULT 'pending',
  header_type         VARCHAR(20),
  header_content      TEXT,
  body                TEXT NOT NULL,
  footer              TEXT,
  buttons             JSONB DEFAULT '[]',
  variables           TEXT[] DEFAULT '{}',
  meta_template_id    VARCHAR(255),
  rejection_reason    TEXT,
  created_by          UUID REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────
-- CAMPAIGNS
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  template_id         UUID REFERENCES public.templates(id),
  status              campaign_status DEFAULT 'draft',
  audience_type       VARCHAR(50),
  audience_filter     JSONB DEFAULT '{}',
  total_recipients    INTEGER DEFAULT 0,
  sent_count          INTEGER DEFAULT 0,
  delivered_count     INTEGER DEFAULT 0,
  read_count          INTEGER DEFAULT 0,
  failed_count        INTEGER DEFAULT 0,
  scheduled_at        TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_by          UUID REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type            VARCHAR(100) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  body            TEXT,
  data            JSONB DEFAULT '{}',
  is_read         BOOLEAN DEFAULT false,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────
-- ACTIVITIES (audit log)
-- ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id        UUID REFERENCES public.profiles(id),
  entity_type     VARCHAR(100) NOT NULL,
  entity_id       UUID NOT NULL,
  action          VARCHAR(100) NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- INDEXES (performance-critical)
-- ════════════════════════════════════════════════════════

-- Contacts
CREATE INDEX IF NOT EXISTS idx_contacts_workspace         ON public.contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone             ON public.contacts(workspace_id, phone);
CREATE INDEX IF NOT EXISTS idx_contacts_tags              ON public.contacts USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_contacts_fts               ON public.contacts USING gin(
  to_tsvector('english', coalesce(name,'') || ' ' || phone)
);

-- Conversations
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_status  ON public.conversations(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_contact           ON public.conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent             ON public.conversations(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg          ON public.conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_fts               ON public.conversations USING gin(
  to_tsvector('english', coalesce(last_message,''))
);

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation      ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id       ON public.messages(whatsapp_msg_id) WHERE whatsapp_msg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_workspace         ON public.messages(workspace_id);

-- Leads
CREATE INDEX IF NOT EXISTS idx_leads_workspace_stage      ON public.leads(workspace_id, stage);
CREATE INDEX IF NOT EXISTS idx_leads_agent                ON public.leads(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_contact              ON public.leads(contact_id);

-- Campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_status ON public.campaigns(workspace_id, status);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread  ON public.notifications(user_id, is_read, created_at DESC);

-- Activities
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

-- Helper: check workspace membership
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  )
$$;

-- Contacts: workspace isolation
DROP POLICY IF EXISTS "contacts_workspace_isolation" ON public.contacts;
CREATE POLICY "contacts_workspace_isolation" ON public.contacts
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- Conversations: workspace isolation
DROP POLICY IF EXISTS "conversations_workspace_isolation" ON public.conversations;
CREATE POLICY "conversations_workspace_isolation" ON public.conversations
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- Agents only update their assigned conversations (admins/managers can update all)
DROP POLICY IF EXISTS "conversations_agent_update" ON public.conversations;
CREATE POLICY "conversations_agent_update" ON public.conversations
  FOR UPDATE USING (
    public.is_workspace_member(workspace_id) AND (
      assigned_agent_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE user_id = auth.uid()
          AND workspace_id = conversations.workspace_id
          AND role IN ('super_admin', 'admin', 'manager')
      )
    )
  );

-- Messages: workspace isolation
DROP POLICY IF EXISTS "messages_workspace_isolation" ON public.messages;
CREATE POLICY "messages_workspace_isolation" ON public.messages
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- Leads: workspace isolation
DROP POLICY IF EXISTS "leads_workspace_isolation" ON public.leads;
CREATE POLICY "leads_workspace_isolation" ON public.leads
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- Templates: workspace isolation
DROP POLICY IF EXISTS "templates_workspace_isolation" ON public.templates;
CREATE POLICY "templates_workspace_isolation" ON public.templates
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- Campaigns: workspace isolation
DROP POLICY IF EXISTS "campaigns_workspace_isolation" ON public.campaigns;
CREATE POLICY "campaigns_workspace_isolation" ON public.campaigns
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- Notifications: users see only their own
DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL USING (user_id = auth.uid());

-- Activities: workspace isolation
DROP POLICY IF EXISTS "activities_workspace_isolation" ON public.activities;
CREATE POLICY "activities_workspace_isolation" ON public.activities
  FOR ALL USING (public.is_workspace_member(workspace_id));

-- ════════════════════════════════════════════════════════
-- AUTO-UPDATE updated_at TRIGGER
-- ════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER contacts_updated_at       BEFORE UPDATE ON public.contacts       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER conversations_updated_at  BEFORE UPDATE ON public.conversations  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER leads_updated_at          BEFORE UPDATE ON public.leads          FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER templates_updated_at      BEFORE UPDATE ON public.templates      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER campaigns_updated_at      BEFORE UPDATE ON public.campaigns      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ════════════════════════════════════════════════════════
-- AUTO-UPDATE conversation.last_message on new message
-- ════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE public.conversations
    SET
      last_message    = LEFT(COALESCE(NEW.content, '[media]'), 200),
      last_message_at = NEW.created_at,
      unread_count    = unread_count + 1,
      updated_at      = NOW()
    WHERE id = NEW.conversation_id;
  ELSE
    UPDATE public.conversations
    SET
      last_message    = LEFT(COALESCE(NEW.content, '[media]'), 200),
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
```

- [ ] **Step 2: Commit the migration file**

```powershell
cd "d:\WhatsApp-Automation"
git add database/migrations/002_core_domain.sql
git commit -m "feat: add 002_core_domain.sql - contacts, conversations, messages, leads, templates, campaigns, notifications, activities"
```

---

## Task 2: Apply Migration to Supabase

**Files:**
- Modify: `d:\WhatsApp-Automation\database\run-migration.mjs`

- [ ] **Step 1: Update run-migration.mjs to point to the new file**

Write `d:\WhatsApp-Automation\database\run-migration.mjs`:

```javascript
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

const FILE = process.argv[2] ?? 'migrations/002_core_domain.sql';

const client = new Client({
  connectionString: 'postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false },
});

const sql = readFileSync(join(__dirname, FILE), 'utf8');

try {
  await client.connect();
  console.log(`✓ Connected to Supabase`);
  await client.query(sql);
  console.log(`✓ Migration applied: ${FILE}`);
} catch (err) {
  console.error('✗ Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
```

- [ ] **Step 2: Run the migration**

```powershell
cd "d:\WhatsApp-Automation"
node database/run-migration.mjs
```

Expected output:
```
✓ Connected to Supabase
✓ Migration applied: migrations/002_core_domain.sql
```

- [ ] **Step 3: Verify tables exist**

```powershell
node -e "
import pg from 'pg';
const { Client } = await import('pg');
const c = new Client({connectionString:'postgresql://postgres.yvqaproltcskufufmomi:Indresh%40626162@aws-1-ap-south-1.pooler.supabase.com:6543/postgres',ssl:{rejectUnauthorized:false}});
await c.connect();
const {rows} = await c.query(\"SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename\");
console.log(rows.map(r=>r.tablename).join(', '));
await c.end();
" --input-type=module
```

Expected: `activities, campaigns, contacts, conversations, leads, messages, notifications, profiles, templates, workspace_members, workspaces`

- [ ] **Step 4: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add database/run-migration.mjs
git commit -m "chore: update run-migration.mjs to accept filename arg; apply 002_core_domain"
```

---

## Task 3: Update TypeScript Database Types

**Files:**
- Modify: `d:\WhatsApp-Automation\types\database.types.ts`

- [ ] **Step 1: Replace with complete schema types**

Write `d:\WhatsApp-Automation\types\database.types.ts`:

```typescript
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ─── Enums ────────────────────────────────────────────
export type UserRole           = 'super_admin' | 'admin' | 'manager' | 'agent';
export type ConversationStatus = 'open' | 'assigned' | 'resolved' | 'pending' | 'snoozed';
export type MessageType        = 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'sticker' | 'interactive' | 'template' | 'internal_note';
export type MessageStatus      = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageDirection   = 'inbound' | 'outbound';
export type LeadStage          = 'new' | 'contacted' | 'follow_up' | 'interested' | 'converted' | 'lost';
export type CampaignStatus     = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed';
export type TemplateStatus     = 'pending' | 'approved' | 'rejected' | 'paused';
export type TemplateCategory   = 'authentication' | 'marketing' | 'utility';

type Rel = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string; full_name: string; email: string; avatar_url: string | null;
          phone: string | null; timezone: string; preferences: Json;
          last_seen_at: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id: string; full_name?: string; email: string; avatar_url?: string | null;
          phone?: string | null; timezone?: string; preferences?: Json;
          last_seen_at?: string | null; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: Rel[];
      };
      workspaces: {
        Row: {
          id: string; name: string; slug: string; logo_url: string | null;
          plan: string; waba_id: string | null; phone_number_id: string | null;
          access_token: string | null; webhook_secret: string | null;
          settings: Json; is_active: boolean; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; name: string; slug: string; logo_url?: string | null;
          plan?: string; waba_id?: string | null; phone_number_id?: string | null;
          access_token?: string | null; webhook_secret?: string | null;
          settings?: Json; is_active?: boolean; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['workspaces']['Insert']>;
        Relationships: Rel[];
      };
      workspace_members: {
        Row: {
          id: string; workspace_id: string; user_id: string; role: UserRole;
          is_online: boolean; max_chats: number; joined_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; user_id: string; role?: UserRole;
          is_online?: boolean; max_chats?: number; joined_at?: string;
        };
        Update: Partial<Database['public']['Tables']['workspace_members']['Insert']>;
        Relationships: Rel[];
      };
      contacts: {
        Row: {
          id: string; workspace_id: string; phone: string; name: string | null;
          email: string | null; avatar_url: string | null; company: string | null;
          country: string | null; language: string; tags: string[];
          custom_fields: Json; is_blocked: boolean; opted_out: boolean;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; phone: string; name?: string | null;
          email?: string | null; avatar_url?: string | null; company?: string | null;
          country?: string | null; language?: string; tags?: string[];
          custom_fields?: Json; is_blocked?: boolean; opted_out?: boolean;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>;
        Relationships: Rel[];
      };
      conversations: {
        Row: {
          id: string; workspace_id: string; contact_id: string;
          assigned_agent_id: string | null; status: ConversationStatus;
          channel: string; subject: string | null; last_message: string | null;
          last_message_at: string | null; unread_count: number; labels: string[];
          is_pinned: boolean; is_starred: boolean; snoozed_until: string | null;
          resolved_at: string | null; meta: Json; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; contact_id: string;
          assigned_agent_id?: string | null; status?: ConversationStatus;
          channel?: string; subject?: string | null; last_message?: string | null;
          last_message_at?: string | null; unread_count?: number; labels?: string[];
          is_pinned?: boolean; is_starred?: boolean; snoozed_until?: string | null;
          resolved_at?: string | null; meta?: Json; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>;
        Relationships: Rel[];
      };
      messages: {
        Row: {
          id: string; conversation_id: string; workspace_id: string;
          sender_type: string; sender_id: string | null; direction: MessageDirection;
          type: MessageType; content: string | null; media_url: string | null;
          media_mime_type: string | null; media_size: number | null;
          media_filename: string | null; caption: string | null;
          whatsapp_msg_id: string | null; status: MessageStatus;
          is_deleted: boolean; reply_to_id: string | null;
          reactions: Json; metadata: Json; delivered_at: string | null;
          read_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; conversation_id: string; workspace_id: string;
          sender_type: string; sender_id?: string | null; direction: MessageDirection;
          type?: MessageType; content?: string | null; media_url?: string | null;
          media_mime_type?: string | null; media_size?: number | null;
          media_filename?: string | null; caption?: string | null;
          whatsapp_msg_id?: string | null; status?: MessageStatus;
          is_deleted?: boolean; reply_to_id?: string | null;
          reactions?: Json; metadata?: Json; delivered_at?: string | null;
          read_at?: string | null; created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
        Relationships: Rel[];
      };
      leads: {
        Row: {
          id: string; workspace_id: string; contact_id: string | null;
          conversation_id: string | null; assigned_agent_id: string | null;
          title: string; stage: LeadStage; value: number | null; currency: string;
          priority: string; source: string | null; notes: string | null;
          tags: string[]; custom_fields: Json; follow_up_at: string | null;
          closed_at: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; contact_id?: string | null;
          conversation_id?: string | null; assigned_agent_id?: string | null;
          title: string; stage?: LeadStage; value?: number | null; currency?: string;
          priority?: string; source?: string | null; notes?: string | null;
          tags?: string[]; custom_fields?: Json; follow_up_at?: string | null;
          closed_at?: string | null; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['leads']['Insert']>;
        Relationships: Rel[];
      };
      templates: {
        Row: {
          id: string; workspace_id: string; name: string;
          category: TemplateCategory; language: string; status: TemplateStatus;
          header_type: string | null; header_content: string | null; body: string;
          footer: string | null; buttons: Json; variables: string[];
          meta_template_id: string | null; rejection_reason: string | null;
          created_by: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; name: string;
          category: TemplateCategory; language?: string; status?: TemplateStatus;
          header_type?: string | null; header_content?: string | null; body: string;
          footer?: string | null; buttons?: Json; variables?: string[];
          meta_template_id?: string | null; rejection_reason?: string | null;
          created_by?: string | null; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['templates']['Insert']>;
        Relationships: Rel[];
      };
      campaigns: {
        Row: {
          id: string; workspace_id: string; name: string;
          template_id: string | null; status: CampaignStatus;
          audience_type: string | null; audience_filter: Json;
          total_recipients: number; sent_count: number; delivered_count: number;
          read_count: number; failed_count: number;
          scheduled_at: string | null; started_at: string | null;
          completed_at: string | null; created_by: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; name: string;
          template_id?: string | null; status?: CampaignStatus;
          audience_type?: string | null; audience_filter?: Json;
          total_recipients?: number; sent_count?: number; delivered_count?: number;
          read_count?: number; failed_count?: number;
          scheduled_at?: string | null; started_at?: string | null;
          completed_at?: string | null; created_by?: string | null;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['campaigns']['Insert']>;
        Relationships: Rel[];
      };
      notifications: {
        Row: {
          id: string; workspace_id: string; user_id: string; type: string;
          title: string; body: string | null; data: Json;
          is_read: boolean; read_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; user_id: string; type: string;
          title: string; body?: string | null; data?: Json;
          is_read?: boolean; read_at?: string | null; created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: Rel[];
      };
      activities: {
        Row: {
          id: string; workspace_id: string; actor_id: string | null;
          entity_type: string; entity_id: string; action: string;
          metadata: Json; created_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; actor_id?: string | null;
          entity_type: string; entity_id: string; action: string;
          metadata?: Json; created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['activities']['Insert']>;
        Relationships: Rel[];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_workspace_member: {
        Args: { ws_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      user_role:           UserRole;
      conversation_status: ConversationStatus;
      message_type:        MessageType;
      message_status:      MessageStatus;
      message_direction:   MessageDirection;
      lead_stage:          LeadStage;
      campaign_status:     CampaignStatus;
      template_status:     TemplateStatus;
      template_category:   TemplateCategory;
    };
  };
}
```

- [ ] **Step 2: Run TypeScript check**

```powershell
cd "d:\WhatsApp-Automation"; npx tsc --noEmit 2>&1 | Select-Object -First 20
```

Expected: Exit 0, zero errors.

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add types/database.types.ts
git commit -m "feat: complete database.types.ts with all 11 tables, 9 enums, strict Row/Insert/Update types"
```

---

## Task 4: Realtime Subscription Hook

**Files:**
- Create: `d:\WhatsApp-Automation\hooks\useRealtime.ts`

- [ ] **Step 1: Write useRealtime hook**

Write `d:\WhatsApp-Automation\hooks\useRealtime.ts`:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/services/supabase/client';

type PostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions<T extends Record<string, unknown>> {
  /** Supabase table to watch */
  table: string;
  /** Event type to listen for */
  event?: PostgresEvent;
  /** Column=value filter (e.g. "conversation_id=eq.abc123") */
  filter?: string;
  /** Callback invoked with the new/old record */
  onEvent: (payload: { eventType: PostgresEvent; new: T; old: Partial<T> }) => void;
  /** Set false to pause the subscription without unmounting */
  enabled?: boolean;
}

export function useRealtime<T extends Record<string, unknown>>({
  table,
  event = '*',
  filter,
  onEvent,
  enabled = true,
}: UseRealtimeOptions<T>): void {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent; // always use latest callback without re-subscribing

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channelName = `${table}:${filter ?? 'all'}:${event}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event,
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          onEventRef.current({
            eventType: payload.eventType as PostgresEvent,
            new: payload.new as T,
            old: payload.old as Partial<T>,
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [table, event, filter, enabled]);
}
```

- [ ] **Step 2: Run TypeScript check**

```powershell
cd "d:\WhatsApp-Automation"; npx tsc --noEmit 2>&1 | Select-Object -First 20
```

Expected: Exit 0.

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add hooks/useRealtime.ts
git commit -m "feat: add useRealtime hook — typed postgres_changes subscription with auto cleanup"
```

---

## Task 5: Presence Tracking Hook

**Files:**
- Create: `d:\WhatsApp-Automation\hooks\usePresence.ts`

- [ ] **Step 1: Write usePresence hook**

Write `d:\WhatsApp-Automation\hooks\usePresence.ts`:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/services/supabase/client';
import { REALTIME_CHANNELS } from '@/realtime/channels';
import { useWorkspaceStore } from '@/store/workspace.store';
import { useAuthStore } from '@/store/auth.store';

interface PresenceState {
  user_id: string;
  status: 'online' | 'away';
  current_conversation: string | null;
}

export function usePresence(): void {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const workspace  = useWorkspaceStore((s) => s.activeWorkspace);
  const user       = useAuthStore((s) => s.user);
  const setAgentOnline = useWorkspaceStore((s) => s.setAgentOnline);

  useEffect(() => {
    if (!workspace?.id || !user?.id) return;

    const supabase = createClient();
    const channelName = REALTIME_CHANNELS.AGENT_PRESENCE(workspace.id);

    const channel = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        // Mark all tracked users as online
        Object.keys(state).forEach((uid) => setAgentOnline(uid, true));
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        setAgentOnline(key, true);
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setAgentOnline(key, false);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            status:  'online',
            current_conversation: null,
          } satisfies PresenceState);
        }
      });

    channelRef.current = channel;

    // Mark offline on unload
    const handleUnload = () => { channel.untrack(); };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [workspace?.id, user?.id, setAgentOnline]);
}
```

- [ ] **Step 2: Run TypeScript check**

```powershell
cd "d:\WhatsApp-Automation"; npx tsc --noEmit 2>&1 | Select-Object -First 20
```

Expected: Exit 0.

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add hooks/usePresence.ts
git commit -m "feat: add usePresence hook — tracks agent online status via Supabase Presence"
```

---

## Task 6: Notifications Realtime Hook

**Files:**
- Create: `d:\WhatsApp-Automation\hooks\useNotifications.ts`

- [ ] **Step 1: Write useNotifications hook**

Write `d:\WhatsApp-Automation\hooks\useNotifications.ts`:

```typescript
'use client';

import { useEffect, useCallback } from 'react';
import { createClient } from '@/services/supabase/client';
import { useAuthStore } from '@/store/auth.store';
import { useNotificationStore } from '@/store/notification.store';
import { REALTIME_CHANNELS } from '@/realtime/channels';
import type { Database } from '@/types/database.types';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

export function useNotifications(): void {
  const user           = useAuthStore((s) => s.user);
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const incrementUnread = useNotificationStore((s) => s.incrementUnread);

  const fetchUnreadCount = useCallback(async (userId: string) => {
    const supabase = createClient();
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (count !== null) setUnreadCount(count);
  }, [setUnreadCount]);

  useEffect(() => {
    if (!user?.id) return;

    // Load initial unread count
    void fetchUnreadCount(user.id);

    const supabase = createClient();
    const channel = supabase
      .channel(REALTIME_CHANNELS.NOTIFICATIONS(user.id))
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const notification = payload.new as NotificationRow;
          if (!notification.is_read) {
            incrementUnread();
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchUnreadCount, incrementUnread]);
}
```

- [ ] **Step 2: Run TypeScript check**

```powershell
cd "d:\WhatsApp-Automation"; npx tsc --noEmit 2>&1 | Select-Object -First 20
```

Expected: Exit 0.

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add hooks/useNotifications.ts
git commit -m "feat: add useNotifications hook — realtime badge counter from Supabase postgres_changes"
```

---

## Task 7: Full Build Verification

- [ ] **Step 1: TypeScript — zero errors**

```powershell
cd "d:\WhatsApp-Automation"; npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Expected: PowerShell completes with no output (exit 0).

- [ ] **Step 2: Production build**

```powershell
cd "d:\WhatsApp-Automation"; npm run build 2>&1 | Select-Object -Last 25
```

Expected: `✓ Compiled successfully`, all routes listed including new API routes.

- [ ] **Step 3: Final commit**

```powershell
cd "d:\WhatsApp-Automation"
git add -A
git commit -m "chore: Phase 3 complete — full domain schema, RLS, indexes, Realtime hooks verified"
```

---

## Spec Coverage Check

| Blueprint Requirement | Covered | Task |
|---|---|---|
| contacts table + workspace isolation RLS | ✅ | Task 1 |
| conversations table + agent/manager RLS | ✅ | Task 1 |
| messages table + workspace isolation | ✅ | Task 1 |
| leads (CRM pipeline) table | ✅ | Task 1 |
| templates table | ✅ | Task 1 |
| campaigns table | ✅ | Task 1 |
| notifications table | ✅ | Task 1 |
| activities (audit log) table | ✅ | Task 1 |
| All ENUMs (9 types) | ✅ | Task 1 |
| Performance indexes (21 indexes) | ✅ | Task 1 |
| `is_workspace_member()` helper function | ✅ | Task 1 |
| `set_updated_at()` trigger on 5 tables | ✅ | Task 1 |
| `update_conversation_last_message()` trigger | ✅ | Task 1 |
| Migration applied to Supabase | ✅ | Task 2 |
| TypeScript types for all 11 tables | ✅ | Task 3 |
| useRealtime — postgres_changes hook | ✅ | Task 4 |
| usePresence — agent online status | ✅ | Task 5 |
| useNotifications — realtime badge | ✅ | Task 6 |
| Supabase Realtime channels named correctly | ✅ | existing realtime/channels.ts |
| Zero TypeScript errors after all changes | ✅ | Task 7 |
