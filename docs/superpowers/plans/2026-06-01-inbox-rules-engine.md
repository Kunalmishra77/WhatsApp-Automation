# Inbox Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully functional Inbox Rules Engine that lets workspace admins define trigger-based automation rules (keyword match, first message, any message) that automatically label conversations, assign agents, change status, send auto-replies, and tag contacts when WhatsApp messages arrive.

**Architecture:** A SQL migration adds the `inbox_rules` table with RLS policies matching existing workspace isolation patterns. A `lib/inbox-rules-engine.ts` library encapsulates all matching and action-execution logic, called from the webhook handler after each inbound message is saved. A CRUD API at `/api/inbox-rules` and `/api/inbox-rules/[id]` serves the Settings UI, which adds an "Inbox Rules" tab to the existing Settings `Tabs` component.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL + admin client), shadcn/ui (Button, Input, Label, Dialog, Select, Switch, Table, Badge, Textarea), TanStack Query, Zod, Lucide React icons, Sonner toasts.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `database/migrations/004_inbox_rules.sql` | Create | Table DDL + indexes + RLS policies |
| `lib/inbox-rules-engine.ts` | Create | Rule matching logic + action execution |
| `app/api/inbox-rules/route.ts` | Create | GET (list) + POST (create) |
| `app/api/inbox-rules/[id]/route.ts` | Create | PATCH (update) + DELETE |
| `app/api/webhooks/whatsapp/route.ts` | Modify | Call `applyInboxRules` after message saved |
| `modules/settings/hooks/useInboxRules.ts` | Create | TanStack Query hooks for CRUD |
| `modules/settings/components/InboxRules/index.tsx` | Create | Table view with toggle + edit/delete |
| `modules/settings/components/InboxRuleForm/index.tsx` | Create | Dialog form for create/edit |
| `modules/settings/components/SettingsLayout/index.tsx` | Modify | Add "Inbox Rules" tab |

---

## Task 1: Database Migration

**Files:**
- Create: `database/migrations/004_inbox_rules.sql`

- [ ] **Step 1: Create the migration file**

Create `database/migrations/004_inbox_rules.sql` with this exact content:

```sql
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

COMMIT;
```

- [ ] **Step 2: Run migration in Supabase SQL editor**

Open the Supabase dashboard → SQL Editor → paste the file content → Run.

Expected: "Success. No rows returned."

If the `is_workspace_member` function doesn't exist yet (check migration 003), the RLS policy will fail. In that case add this before the policy:

```sql
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  );
$$;
```

- [ ] **Step 3: Verify table exists**

In Supabase SQL Editor run:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'inbox_rules' ORDER BY ordinal_position;
```

Expected: rows for id, workspace_id, name, is_active, trigger_type, trigger_value, actions, priority, created_at, updated_at.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/004_inbox_rules.sql
git commit -m "feat: add inbox_rules table migration with RLS"
```

---

## Task 2: Rules Engine Library

**Files:**
- Create: `lib/inbox-rules-engine.ts`

- [ ] **Step 1: Create the rules engine library**

Create `lib/inbox-rules-engine.ts`:

```typescript
import { createAdminClient } from '@/services/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface RuleAction {
  type: 'label' | 'assign' | 'status' | 'auto_reply' | 'tag_contact';
  value: string;
}

export interface InboxRule {
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: 'keyword' | 'first_message' | 'any_message';
  trigger_value: {
    keywords?: string[];
    match?: 'any' | 'all';
  };
  actions: RuleAction[];
  priority: number;
}

function matchesTrigger(
  rule: InboxRule,
  messageContent: string,
  isFirstMessage: boolean,
): boolean {
  switch (rule.trigger_type) {
    case 'any_message':
      return true;

    case 'first_message':
      return isFirstMessage;

    case 'keyword': {
      const keywords = rule.trigger_value.keywords ?? [];
      if (keywords.length === 0) return false;
      const lower = messageContent.toLowerCase();
      const matchType = rule.trigger_value.match ?? 'any';
      if (matchType === 'all') {
        return keywords.every((kw) => lower.includes(kw.toLowerCase()));
      }
      return keywords.some((kw) => lower.includes(kw.toLowerCase()));
    }

    default:
      return false;
  }
}

async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  body: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.replace(/﻿/g, '').trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'text',
          text: { preview_url: false, body },
        }),
      },
    );

    if (!response.ok) {
      console.error('[InboxRules] WhatsApp API error:', await response.text());
      return null;
    }

    const data = await response.json() as { messages?: Array<{ id?: string }> };
    return data?.messages?.[0]?.id ?? null;
  } catch (err) {
    console.error('[InboxRules] sendWhatsAppMessage failed:', err);
    return null;
  }
}

async function executeAction(
  supabase: AdminClient,
  action: RuleAction,
  conversationId: string,
  contactId: string,
  workspaceId: string,
  phoneNumberId: string,
  accessToken: string,
): Promise<void> {
  const db = supabase as any;

  switch (action.type) {
    case 'label': {
      await db
        .from('conversations')
        .update({
          labels: db.raw
            ? undefined // raw not available on typed client
            : undefined,
        })
        .eq('id', conversationId);

      // array_append via RPC — use rpc or raw SQL via supabase.rpc
      await db.rpc('append_conversation_label', {
        p_conversation_id: conversationId,
        p_label: action.value,
      });
      break;
    }

    case 'assign': {
      await db
        .from('conversations')
        .update({ assigned_agent_id: action.value, status: 'assigned' })
        .eq('id', conversationId);
      break;
    }

    case 'status': {
      await db
        .from('conversations')
        .update({ status: action.value })
        .eq('id', conversationId);
      break;
    }

    case 'auto_reply': {
      // Fetch contact's phone number
      const { data: contact, error: contactError } = await db
        .from('contacts')
        .select('phone')
        .eq('id', contactId)
        .single();

      if (contactError || !contact?.phone) {
        console.error('[InboxRules] Cannot find contact phone for auto_reply');
        break;
      }

      const waMessageId = await sendWhatsAppMessage(
        phoneNumberId,
        accessToken,
        contact.phone as string,
        action.value,
      );

      const now = new Date().toISOString();

      await db.from('messages').insert({
        conversation_id: conversationId,
        workspace_id: workspaceId,
        sender_type: 'bot',
        sender_id: null,
        direction: 'outbound',
        type: 'text',
        content: action.value,
        status: 'sent',
        whatsapp_msg_id: waMessageId,
        created_at: now,
      });

      await db
        .from('conversations')
        .update({ last_message: action.value, last_message_at: now })
        .eq('id', conversationId);

      break;
    }

    case 'tag_contact': {
      // Use RPC to append tag without overwriting existing ones
      await db.rpc('append_contact_tag', {
        p_contact_id: contactId,
        p_tag: action.value,
      });
      break;
    }

    default:
      console.warn('[InboxRules] Unknown action type:', (action as RuleAction).type);
  }
}

export async function applyInboxRules(
  supabase: AdminClient,
  workspaceId: string,
  messageContent: string,
  conversationId: string,
  contactId: string,
  isFirstMessage: boolean,
  phoneNumberId: string,
  accessToken: string,
): Promise<void> {
  const db = supabase as any;

  const { data: rules, error } = await db
    .from('inbox_rules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (error) {
    console.error('[InboxRules] Failed to fetch rules:', error.message);
    return;
  }

  if (!rules || rules.length === 0) return;

  for (const rule of rules as InboxRule[]) {
    const matched = matchesTrigger(rule, messageContent, isFirstMessage);

    if (!matched) continue;

    console.log(`[InboxRules] Rule "${rule.name}" matched — executing ${rule.actions.length} action(s)`);

    for (const action of rule.actions) {
      try {
        await executeAction(
          supabase,
          action,
          conversationId,
          contactId,
          workspaceId,
          phoneNumberId,
          accessToken,
        );
        console.log(`[InboxRules]   action ${action.type}="${action.value}" executed`);
      } catch (err) {
        console.error(`[InboxRules]   action ${action.type} failed:`, err);
      }
    }
  }
}
```

- [ ] **Step 2: Add two Supabase RPC helper functions to handle array_append safely**

The `label` and `tag_contact` actions need server-side array_append to avoid overwriting arrays. Run these in Supabase SQL Editor:

```sql
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
```

- [ ] **Step 3: Fix the label action in the engine (simplify now that RPC is available)**

The `label` case currently has dead code from exploring the raw approach. Clean it up — the final `label` case body should be:

```typescript
case 'label': {
  await db.rpc('append_conversation_label', {
    p_conversation_id: conversationId,
    p_label: action.value,
  });
  break;
}
```

Edit `lib/inbox-rules-engine.ts` so the `label` case reads exactly as above (remove the prior dead-code lines referencing `db.raw`).

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors in `lib/inbox-rules-engine.ts`. If there are errors, fix them before proceeding.

- [ ] **Step 5: Commit**

```bash
git add lib/inbox-rules-engine.ts
git commit -m "feat: add inbox rules engine library with matching and action execution"
```

---

## Task 3: API Routes

**Files:**
- Create: `app/api/inbox-rules/route.ts`
- Create: `app/api/inbox-rules/[id]/route.ts`

- [ ] **Step 1: Create GET + POST route**

Create `app/api/inbox-rules/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { createClient } from '@/services/supabase/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await (supabase as any)
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  return (member?.workspace_id as string) ?? null;
}

export async function GET(_request: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('inbox_rules')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('priority', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rules: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[InboxRules GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const body = await request.json() as {
      name: string;
      trigger_type: string;
      trigger_value?: Record<string, unknown>;
      actions?: Array<{ type: string; value: string }>;
      priority?: number;
      is_active?: boolean;
    };

    if (!body.name || !body.trigger_type) {
      return NextResponse.json({ error: 'name and trigger_type are required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('inbox_rules')
      .insert({
        workspace_id:  workspaceId,
        name:          body.name,
        trigger_type:  body.trigger_type,
        trigger_value: body.trigger_value ?? {},
        actions:       body.actions ?? [],
        priority:      body.priority ?? 0,
        is_active:     body.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule: data }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[InboxRules POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create PATCH + DELETE route**

Create `app/api/inbox-rules/[id]/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { createClient } from '@/services/supabase/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

async function getRuleWorkspaceId(ruleId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await (supabase as any)
    .from('inbox_rules')
    .select('workspace_id')
    .eq('id', ruleId)
    .single();
  return (data?.workspace_id as string) ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = await getRuleWorkspaceId(id);

    if (!workspaceId) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const body = await request.json() as {
      name?: string;
      is_active?: boolean;
      trigger_type?: string;
      trigger_value?: Record<string, unknown>;
      actions?: Array<{ type: string; value: string }>;
      priority?: number;
    };

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name          !== undefined) patch.name          = body.name;
    if (body.is_active     !== undefined) patch.is_active     = body.is_active;
    if (body.trigger_type  !== undefined) patch.trigger_type  = body.trigger_type;
    if (body.trigger_value !== undefined) patch.trigger_value = body.trigger_value;
    if (body.actions       !== undefined) patch.actions       = body.actions;
    if (body.priority      !== undefined) patch.priority      = body.priority;

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('inbox_rules')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[InboxRules PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = await getRuleWorkspaceId(id);

    if (!workspaceId) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const supabase = createAdminClient();
    const { error } = await (supabase as any)
      .from('inbox_rules')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[InboxRules DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors in the new route files.

- [ ] **Step 4: Commit**

```bash
git add app/api/inbox-rules/route.ts "app/api/inbox-rules/[id]/route.ts"
git commit -m "feat: add inbox-rules CRUD API routes"
```

---

## Task 4: Webhook Integration

**Files:**
- Modify: `app/api/webhooks/whatsapp/route.ts`

- [ ] **Step 1: Add import at top of webhook route**

In `app/api/webhooks/whatsapp/route.ts`, add the import after the existing imports (after line 5 `import { getRequiredSecret } from '@/lib/supabase-env';`):

```typescript
import { applyInboxRules } from '@/lib/inbox-rules-engine';
```

- [ ] **Step 2: Add isFirstMessage detection and rules call in handleIncomingMessage**

In `handleIncomingMessage`, after the duplicate check block (after line 265 where `messageError?.code === '23505'` is handled and we `return`), but **before** the escalation detection block, add this code:

```typescript
  // Count messages in this conversation before the one just inserted
  // (we already inserted it, so count > 1 means NOT first message)
  const { count: msgCount } = await (supabase as any)
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('direction', 'inbound');

  const isFirstMessage = (msgCount ?? 0) <= 1;

  // Fetch workspace credentials for any auto_reply actions
  const { data: wsForRules } = await supabase
    .from('workspaces')
    .select('phone_number_id, access_token')
    .eq('id', workspaceId)
    .single();

  if (wsForRules?.phone_number_id && wsForRules?.access_token) {
    await applyInboxRules(
      supabase,
      workspaceId,
      content,
      conversation.id,
      contact.id,
      isFirstMessage,
      wsForRules.phone_number_id,
      wsForRules.access_token,
    );
  }
```

Place this block right before the line `// Escalation detection — check BEFORE calling AI auto-reply`.

The full `handleIncomingMessage` function after the change should look like this in the relevant section:

```
  ... (message insert) ...

  if (messageError?.code === '23505') {
    console.log(`[Webhook] Duplicate message ignored: ${msg.id}`);
    return;
  }

  if (messageError) {
    throw new Error(messageError.message);
  }

  // Count messages in this conversation before the one just inserted
  const { count: msgCount } = await (supabase as any)
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('direction', 'inbound');

  const isFirstMessage = (msgCount ?? 0) <= 1;

  // Fetch workspace credentials for any auto_reply actions
  const { data: wsForRules } = await supabase
    .from('workspaces')
    .select('phone_number_id, access_token')
    .eq('id', workspaceId)
    .single();

  if (wsForRules?.phone_number_id && wsForRules?.access_token) {
    await applyInboxRules(
      supabase,
      workspaceId,
      content,
      conversation.id,
      contact.id,
      isFirstMessage,
      wsForRules.phone_number_id,
      wsForRules.access_token,
    );
  }

  // Escalation detection — check BEFORE calling AI auto-reply
  const isEscalation = checkEscalationKeywords(content);
  ...
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors in the webhook route.

- [ ] **Step 4: Commit**

```bash
git add app/api/webhooks/whatsapp/route.ts
git commit -m "feat: integrate inbox rules engine into WhatsApp webhook handler"
```

---

## Task 5: TanStack Query Hooks

**Files:**
- Create: `modules/settings/hooks/useInboxRules.ts`

- [ ] **Step 1: Create the hooks file**

Create `modules/settings/hooks/useInboxRules.ts`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';

export interface RuleAction {
  type: 'label' | 'assign' | 'status' | 'auto_reply' | 'tag_contact';
  value: string;
}

export interface InboxRule {
  id: string;
  workspace_id: string;
  name: string;
  is_active: boolean;
  trigger_type: 'keyword' | 'first_message' | 'any_message';
  trigger_value: {
    keywords?: string[];
    match?: 'any' | 'all';
  };
  actions: RuleAction[];
  priority: number;
  created_at: string;
  updated_at: string;
}

export type CreateInboxRulePayload = Omit<InboxRule, 'id' | 'workspace_id' | 'created_at' | 'updated_at'>;
export type UpdateInboxRulePayload = Partial<CreateInboxRulePayload>;

async function fetchRules(): Promise<InboxRule[]> {
  const res = await fetch('/api/inbox-rules');
  const data = await res.json() as { rules?: InboxRule[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to fetch rules');
  return data.rules ?? [];
}

async function createRule(payload: CreateInboxRulePayload): Promise<InboxRule> {
  const res = await fetch('/api/inbox-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json() as { rule?: InboxRule; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to create rule');
  return data.rule!;
}

async function updateRule(id: string, payload: UpdateInboxRulePayload): Promise<InboxRule> {
  const res = await fetch(`/api/inbox-rules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json() as { rule?: InboxRule; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to update rule');
  return data.rule!;
}

async function deleteRule(id: string): Promise<void> {
  const res = await fetch(`/api/inbox-rules/${id}`, { method: 'DELETE' });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to delete rule');
}

export function useInboxRules() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['inbox-rules', workspaceId],
    queryFn: fetchRules,
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useCreateInboxRule() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (payload: CreateInboxRulePayload) => createRule(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox-rules', workspaceId] }),
  });
}

export function useUpdateInboxRule() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateInboxRulePayload }) =>
      updateRule(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox-rules', workspaceId] }),
  });
}

export function useDeleteInboxRule() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (id: string) => deleteRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox-rules', workspaceId] }),
  });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors in the hooks file.

- [ ] **Step 3: Commit**

```bash
git add modules/settings/hooks/useInboxRules.ts
git commit -m "feat: add useInboxRules TanStack Query hooks"
```

---

## Task 6: InboxRuleForm Dialog Component

**Files:**
- Create: `modules/settings/components/InboxRuleForm/index.tsx`

- [ ] **Step 1: Create the form component**

Create `modules/settings/components/InboxRuleForm/index.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspaceStore } from '@/store/workspace.store';
import {
  useCreateInboxRule,
  useUpdateInboxRule,
  type InboxRule,
  type RuleAction,
  type CreateInboxRulePayload,
} from '../../hooks/useInboxRules';

interface Props {
  open: boolean;
  onClose: () => void;
  rule?: InboxRule;
}

const TRIGGER_LABELS: Record<string, string> = {
  keyword:       'Keyword Match',
  first_message: 'First Message',
  any_message:   'Any Message',
};

const ACTION_LABELS: Record<string, string> = {
  label:        'Add Label',
  assign:       'Assign Agent',
  status:       'Change Status',
  auto_reply:   'Auto Reply',
  tag_contact:  'Tag Contact',
};

const STATUS_OPTIONS = ['open', 'pending', 'resolved', 'assigned'];

export function InboxRuleForm({ open, onClose, rule }: Props) {
  const members = useWorkspaceStore((s) => s.members);

  const [name, setName]               = useState('');
  const [triggerType, setTriggerType] = useState<string>('keyword');
  const [keywords, setKeywords]       = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [matchType, setMatchType]     = useState<'any' | 'all'>('any');
  const [actions, setActions]         = useState<RuleAction[]>([]);
  const [priority, setPriority]       = useState(0);

  const create = useCreateInboxRule();
  const update = useUpdateInboxRule();

  // Populate form when editing
  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setTriggerType(rule.trigger_type);
      setKeywords(rule.trigger_value.keywords ?? []);
      setMatchType(rule.trigger_value.match ?? 'any');
      setActions(rule.actions);
      setPriority(rule.priority);
    } else {
      setName('');
      setTriggerType('keyword');
      setKeywords([]);
      setKeywordInput('');
      setMatchType('any');
      setActions([]);
      setPriority(0);
    }
  }, [rule, open]);

  const addKeyword = () => {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw || keywords.includes(kw)) return;
    setKeywords((prev) => [...prev, kw]);
    setKeywordInput('');
  };

  const removeKeyword = (kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  };

  const addAction = () => {
    setActions((prev) => [...prev, { type: 'label', value: '' }]);
  };

  const removeAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, field: keyof RuleAction, value: string) => {
    setActions((prev) =>
      prev.map((a, i) =>
        i === index ? { ...a, [field]: value } : a,
      ),
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Rule name is required');
      return;
    }
    if (actions.length === 0) {
      toast.error('At least one action is required');
      return;
    }
    if (actions.some((a) => !a.value.trim())) {
      toast.error('All actions must have a value');
      return;
    }

    const payload: CreateInboxRulePayload = {
      name:          name.trim(),
      is_active:     rule?.is_active ?? true,
      trigger_type:  triggerType as InboxRule['trigger_type'],
      trigger_value: triggerType === 'keyword'
        ? { keywords, match: matchType }
        : {},
      actions,
      priority,
    };

    try {
      if (rule) {
        await update.mutateAsync({ id: rule.id, payload });
        toast.success('Rule updated');
      } else {
        await create.mutateAsync(payload);
        toast.success('Rule created');
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save rule');
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? 'Edit Rule' : 'New Inbox Rule'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Rule Name</Label>
            <Input
              id="rule-name"
              placeholder="e.g. Tag urgent keywords"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Trigger Type */}
          <div className="space-y-1.5">
            <Label>Trigger</Label>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Keyword config */}
          {triggerType === 'keyword' && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="space-y-1.5">
                <Label>Keywords</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Type keyword and press Enter"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addKeyword(); }
                    }}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addKeyword}>
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {keywords.map((kw) => (
                    <Badge key={kw} variant="secondary" className="gap-1">
                      {kw}
                      <button
                        type="button"
                        className="ml-0.5 rounded-full hover:text-destructive"
                        onClick={() => removeKeyword(kw)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Match Type</Label>
                <Select value={matchType} onValueChange={(v) => setMatchType(v as 'any' | 'all')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any keyword (OR)</SelectItem>
                    <SelectItem value="all">All keywords (AND)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Actions</Label>
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addAction}>
                <Plus className="h-3 w-3" /> Add Action
              </Button>
            </div>

            {actions.length === 0 && (
              <p className="text-xs text-muted-foreground">No actions yet. Click "Add Action".</p>
            )}

            {actions.map((action, index) => (
              <div key={index} className="flex items-start gap-2 rounded-md border border-border p-3">
                <div className="flex flex-1 flex-col gap-2">
                  <Select
                    value={action.type}
                    onValueChange={(v) => updateAction(index, 'type', v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACTION_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {action.type === 'status' ? (
                    <Select
                      value={action.value}
                      onValueChange={(v) => updateAction(index, 'value', v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select status…" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : action.type === 'assign' ? (
                    <Select
                      value={action.value}
                      onValueChange={(v) => updateAction(index, 'value', v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select agent…" />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.user_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : action.type === 'auto_reply' ? (
                    <Textarea
                      className="text-sm"
                      placeholder="Reply message…"
                      rows={2}
                      value={action.value}
                      onChange={(e) => updateAction(index, 'value', e.target.value)}
                    />
                  ) : (
                    <Input
                      className="h-8 text-sm"
                      placeholder={action.type === 'label' ? 'Label name…' : 'Tag name…'}
                      value={action.value}
                      onChange={(e) => updateAction(index, 'value', e.target.value)}
                    />
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeAction(index)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label htmlFor="rule-priority">Priority</Label>
            <Input
              id="rule-priority"
              type="number"
              min={0}
              max={100}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-24"
            />
            <p className="text-xs text-muted-foreground">Higher number = runs first. Default: 0.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={isPending}>
            {isPending ? 'Saving…' : rule ? 'Save Changes' : 'Create Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors in `InboxRuleForm`.

- [ ] **Step 3: Commit**

```bash
git add modules/settings/components/InboxRuleForm/index.tsx
git commit -m "feat: add InboxRuleForm dialog component"
```

---

## Task 7: InboxRules Table Component

**Files:**
- Create: `modules/settings/components/InboxRules/index.tsx`

- [ ] **Step 1: Create the table component**

Create `modules/settings/components/InboxRules/index.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useInboxRules,
  useUpdateInboxRule,
  useDeleteInboxRule,
  type InboxRule,
} from '../../hooks/useInboxRules';
import { InboxRuleForm } from '../InboxRuleForm';

const TRIGGER_LABELS: Record<string, string> = {
  keyword:       'Keyword Match',
  first_message: 'First Message',
  any_message:   'Any Message',
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  label:       'Label',
  assign:      'Assign',
  status:      'Status',
  auto_reply:  'Auto Reply',
  tag_contact: 'Tag Contact',
};

function summariseActions(actions: InboxRule['actions']): string {
  if (actions.length === 0) return '—';
  return actions
    .map((a) => `${ACTION_TYPE_LABELS[a.type] ?? a.type}: ${a.value}`)
    .join(', ');
}

export function InboxRules() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState<InboxRule | undefined>();

  const { data: rules = [], isLoading } = useInboxRules();
  const update = useUpdateInboxRule();
  const remove = useDeleteInboxRule();

  const handleToggle = async (rule: InboxRule, checked: boolean) => {
    try {
      await update.mutateAsync({ id: rule.id, payload: { is_active: checked } });
    } catch {
      toast.error('Failed to update rule');
    }
  };

  const handleDelete = async (rule: InboxRule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await remove.mutateAsync(rule.id);
      toast.success('Rule deleted');
    } catch {
      toast.error('Failed to delete rule');
    }
  };

  const handleEdit = (rule: InboxRule) => {
    setEditing(rule);
    setFormOpen(true);
  };

  const handleNew = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Inbox Rules</h2>
          <p className="text-xs text-muted-foreground">Automate actions when messages arrive.</p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleNew}>
          <Plus className="h-3.5 w-3.5" /> New Rule
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Actions</TableHead>
              <TableHead className="w-20 text-center">Priority</TableHead>
              <TableHead className="w-20 text-center">Active</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : rules.map((rule) => (
                  <TableRow key={rule.id} className="hover:bg-accent">
                    <TableCell className="font-medium text-sm">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {TRIGGER_LABELS[rule.trigger_type] ?? rule.trigger_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {summariseActions(rule.actions)}
                    </TableCell>
                    <TableCell className="text-center text-sm">{rule.priority}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) => void handleToggle(rule, checked)}
                        disabled={update.isPending}
                        aria-label={`Toggle rule ${rule.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(rule)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => void handleDelete(rule)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        {!isLoading && rules.length === 0 && (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No rules yet. Click "New Rule" to create your first automation.
            </p>
          </div>
        )}
      </div>

      <InboxRuleForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        rule={editing}
      />
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add modules/settings/components/InboxRules/index.tsx
git commit -m "feat: add InboxRules table component with active toggle and edit/delete"
```

---

## Task 8: Wire into Settings UI

**Files:**
- Modify: `modules/settings/components/SettingsLayout/index.tsx`

- [ ] **Step 1: Add the InboxRules tab to SettingsLayout**

Edit `modules/settings/components/SettingsLayout/index.tsx`. Add the import at the top (after the existing component imports):

```typescript
import { InboxRules } from '../InboxRules';
```

Then add a new tab trigger and content. The full updated file should be:

```tsx
'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSettings } from '../ProfileSettings';
import { WorkspaceSettings } from '../WorkspaceSettings';
import { WhatsAppSettings } from '../WhatsAppSettings';
import { InboxRules } from '../InboxRules';

export function SettingsLayout() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account and workspace.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="inbox-rules">Inbox Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSettings />
        </TabsContent>
        <TabsContent value="workspace">
          <WorkspaceSettings />
        </TabsContent>
        <TabsContent value="whatsapp">
          <WhatsAppSettings />
        </TabsContent>
        <TabsContent value="inbox-rules">
          <InboxRules />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Full TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: zero errors across all files. Fix any remaining type errors before committing.

Common issues and fixes:
- If `Switch` from shadcn/ui is missing: `npx shadcn@latest add switch`
- If `Textarea` from shadcn/ui is missing: `npx shadcn@latest add textarea`
- If `Badge` from shadcn/ui is missing: `npx shadcn@latest add badge`

- [ ] **Step 3: Commit**

```bash
git add modules/settings/components/SettingsLayout/index.tsx
git commit -m "feat: add Inbox Rules tab to Settings page"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|---|---|
| `004_inbox_rules.sql` migration | Task 1 |
| RLS policies | Task 1 |
| `GET /api/inbox-rules` | Task 3 |
| `POST /api/inbox-rules` | Task 3 |
| `PATCH /api/inbox-rules/[id]` | Task 3 |
| `DELETE /api/inbox-rules/[id]` | Task 3 |
| `lib/inbox-rules-engine.ts` with `applyInboxRules` | Task 2 |
| keyword / first_message / any_message triggers | Task 2 |
| label / assign / status / auto_reply / tag_contact actions | Task 2 |
| Webhook integration with isFirstMessage | Task 4 |
| Rules called BEFORE escalation check | Task 4 |
| `useInboxRules` / `useCreateInboxRule` / `useUpdateInboxRule` / `useDeleteInboxRule` hooks | Task 5 |
| InboxRules table component with active toggle | Task 7 |
| InboxRuleForm dialog with all trigger/action types | Task 6 |
| Settings nav "Inbox Rules" tab | Task 8 |
| `npx tsc --noEmit` passes | Tasks 2, 3, 5, 6, 7, 8 |

### Type Consistency

- `InboxRule` interface defined in `useInboxRules.ts` (Task 5) — imported in both `InboxRules/index.tsx` (Task 7) and `InboxRuleForm/index.tsx` (Task 6)
- `RuleAction` interface defined in `useInboxRules.ts` (Task 5) — imported in `InboxRuleForm/index.tsx` (Task 6)
- `applyInboxRules` signature in `lib/inbox-rules-engine.ts` (Task 2) — called with matching args in `route.ts` (Task 4)
- `AdminClient` type in engine file derived from `ReturnType<typeof createAdminClient>` — same pattern as webhook route

### No Placeholders Found

All code blocks contain complete implementations. No TBD, TODO, or "similar to above" entries.
