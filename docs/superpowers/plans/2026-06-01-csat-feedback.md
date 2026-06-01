# CSAT Feedback Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSAT (Customer Satisfaction) feedback collection to the Agentix WhatsApp platform — send a star-rating request when a conversation is resolved, capture the reply via webhook, and surface aggregate scores in analytics.

**Architecture:** A new `/api/conversations/[id]/resolve` POST endpoint handles resolution + CSAT message dispatch atomically. The existing webhook handler is extended with an early-exit CSAT-reply branch that saves the score and sends a thank-you before any AI/flow logic runs. Analytics overview API gains two new summary fields, and the dashboard renders a CSAT score card.

**Tech Stack:** Next.js App Router API routes, Supabase (admin client), React Query mutations, TypeScript strict mode, Recharts/shadcn UI for the dashboard card.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `database/migrations/006_csat.sql` | Create | Schema: `csat_responses` table + indexes + RLS |
| `app/api/conversations/[id]/resolve/route.ts` | Create | POST — resolve conversation + send CSAT WhatsApp message + insert pending CSAT record |
| `app/api/webhooks/whatsapp/route.ts` | Modify | Add early-exit CSAT reply branch before rules/flow/AI |
| `modules/conversations/hooks/useConversationActions.ts` | Modify | Add `useResolveConversation` mutation |
| `modules/conversations/components/ConversationHeader/index.tsx` | Modify | Wire Resolve button to `useResolveConversation` |
| `app/api/analytics/overview/route.ts` | Modify | Add `csatAvgScore` and `csatResponseCount` to summary |
| `modules/analytics/hooks/useAnalytics.ts` | Modify | Add `csatAvgScore` and `csatResponseCount` to `AnalyticsSummary` interface |
| `modules/analytics/components/AnalyticsDashboard/index.tsx` | Modify | Add CSAT score SummaryCard |

---

## Task 1: DB Migration

**Files:**
- Create: `database/migrations/006_csat.sql`

- [ ] **Step 1: Write the migration file**

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.csat_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES public.contacts(id),
  agent_id        UUID REFERENCES public.profiles(id),
  score           INTEGER CHECK (score BETWEEN 1 AND 5),
  comment         TEXT,
  responded_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_csat_workspace     ON public.csat_responses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_csat_conversation  ON public.csat_responses(conversation_id);

ALTER TABLE public.csat_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "csat_workspace" ON public.csat_responses;
CREATE POLICY "csat_workspace" ON public.csat_responses
  FOR ALL USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

COMMIT;
```

- [ ] **Step 2: Verify TypeScript still compiles (no TS in SQL, but confirm file saved)**

```
npx tsc --noEmit
```

Expected: zero errors (no TS changes yet).

- [ ] **Step 3: Commit**

```bash
git add database/migrations/006_csat.sql
git commit -m "feat: add csat_responses migration 006"
```

---

## Task 2: Resolve API Route

**Files:**
- Create: `app/api/conversations/[id]/resolve/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

const CSAT_MESSAGE = `Thank you for contacting V4TOU Tech! 🙏

How would you rate your experience today?
Reply with a number:
1 ⭐ - Poor
2 ⭐⭐ - Fair
3 ⭐⭐⭐ - Good
4 ⭐⭐⭐⭐ - Very Good
5 ⭐⭐⭐⭐⭐ - Excellent`;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversationId } = await params;
    const supabase = createAdminClient();
    const db = supabase as any;

    // 1. Fetch conversation
    const { data: conversation, error: fetchError } = await db
      .from('conversations')
      .select('id, workspace_id, contact_id, assigned_agent_id, contacts(id, phone)')
      .eq('id', conversationId)
      .single();

    if (fetchError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 2. Permission check
    const authz = await requireWorkspacePermission(
      conversation.workspace_id,
      'handle_conversations',
    );

    // 3. Update conversation → resolved
    const { error: updateError } = await db
      .from('conversations')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', conversationId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to resolve conversation' }, { status: 500 });
    }

    // 4. Load workspace credentials
    const { data: ws } = await db
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', conversation.workspace_id)
      .single();

    // 5. Get contact phone
    const contactPhone: string | null = conversation.contacts?.phone ?? null;
    const contactId: string | null = conversation.contacts?.id ?? null;

    // 6. Send CSAT WhatsApp message
    if (ws?.phone_number_id && ws?.access_token && contactPhone) {
      try {
        await fetch(
          `https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${(ws.access_token as string).replace(/﻿/g, '').trim()}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: contactPhone,
              type: 'text',
              text: { preview_url: false, body: CSAT_MESSAGE },
            }),
          },
        );
      } catch (err) {
        console.error('[Resolve] Failed to send CSAT message:', err);
        // Non-fatal — resolution already saved
      }

      // 7. Insert pending CSAT record (score = null until user replies)
      await db.from('csat_responses').insert({
        workspace_id:    conversation.workspace_id,
        conversation_id: conversationId,
        contact_id:      contactId,
        agent_id:        authz.userId,
        score:           null,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Resolve] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/conversations/[id]/resolve/route.ts
git commit -m "feat: add resolve endpoint with CSAT dispatch"
```

---

## Task 3: Webhook CSAT Reply Detection

**Files:**
- Modify: `app/api/webhooks/whatsapp/route.ts`

The insertion point is inside `handleIncomingMessage`, right after the message is saved to DB (after the duplicate-check block, line ~270), and BEFORE the `applyInboxRules` call. If the message is a valid CSAT reply (1-5), update the score, send thank-you, and return early.

- [ ] **Step 1: Add `checkAndHandleCsatReply` function**

Add this function before `handleIncomingMessage` in the file (or after `handleStatusUpdate`):

```typescript
async function checkAndHandleCsatReply(
  supabase: AdminClient,
  conversationId: string,
  workspaceId: string,
  contactPhone: string,
  content: string,
): Promise<boolean> {
  const trimmed = content.trim();
  const score = parseInt(trimmed, 10);
  if (isNaN(score) || score < 1 || score > 5 || trimmed.length !== 1) return false;

  // Check for pending CSAT record for this conversation
  const db = supabase as any;
  const { data: pending } = await db
    .from('csat_responses')
    .select('id')
    .eq('conversation_id', conversationId)
    .is('score', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) return false;

  // Update score
  await db
    .from('csat_responses')
    .update({ score, responded_at: new Date().toISOString() })
    .eq('id', pending.id);

  // Send thank-you
  const { data: ws } = await supabase
    .from('workspaces')
    .select('phone_number_id, access_token')
    .eq('id', workspaceId)
    .single();

  if (ws?.phone_number_id && ws?.access_token) {
    try {
      await fetch(
        `https://graph.facebook.com/v19.0/${ws.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${(ws.access_token as string).replace(/﻿/g, '').trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: contactPhone,
            type: 'text',
            text: { preview_url: false, body: 'Thank you for your feedback! ⭐ We appreciate it.' },
          }),
        },
      );
    } catch (err) {
      console.error('[CSAT] Failed to send thank-you:', err);
    }
  }

  return true;
}
```

- [ ] **Step 2: Call it inside `handleIncomingMessage` after the duplicate-check return**

Find the block ending with:
```typescript
  if (messageError?.code === '23505') {
    console.log(`[Webhook] Duplicate message ignored: ${msg.id}`);
    return;
  }

  if (messageError) {
    throw new Error(messageError.message);
  }
```

Immediately after that block (before `const { count: msgCount }...`), add:

```typescript
  // ── CSAT reply detection (before rules/flow/AI) ────────────────────────────
  const csatHandled = await checkAndHandleCsatReply(
    supabase,
    conversation.id,
    workspaceId,
    waId,
    content,
  );
  if (csatHandled) {
    console.log(`[Webhook] CSAT reply handled for conversation ${conversation.id}`);
    return;
  }
  // ──────────────────────────────────────────────────────────────────────────
```

- [ ] **Step 3: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/webhooks/whatsapp/route.ts
git commit -m "feat: detect and save CSAT replies in webhook handler"
```

---

## Task 4: useResolveConversation Hook

**Files:**
- Modify: `modules/conversations/hooks/useConversationActions.ts`

- [ ] **Step 1: Add `useResolveConversation` export**

Append to the end of the file:

```typescript
// ─── useResolveConversation ─────────────────────────────────────────────────

export function useResolveConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await fetch(`/api/conversations/${conversationId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Failed to resolve conversation');
      }

      return res.json();
    },
    onSuccess: (_data, conversationId) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add modules/conversations/hooks/useConversationActions.ts
git commit -m "feat: add useResolveConversation mutation"
```

---

## Task 5: Wire ConversationHeader Resolve Button

**Files:**
- Modify: `modules/conversations/components/ConversationHeader/index.tsx`

- [ ] **Step 1: Import `useResolveConversation` and update the Resolve button**

Change the import line:
```typescript
import { useAssignAgent, useChangeStatus } from '../../hooks/useConversationActions';
```
to:
```typescript
import { useAssignAgent, useChangeStatus, useResolveConversation } from '../../hooks/useConversationActions';
```

- [ ] **Step 2: Instantiate the hook**

After `const changeStatus = useChangeStatus();`, add:
```typescript
  const resolveConversation = useResolveConversation();
```

- [ ] **Step 3: Replace the Resolve button's onClick**

Change the Resolve button from:
```typescript
        {/* Resolve button — only show if not resolved */}
        {conversation.status !== 'resolved' && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => handleStatus('resolved')}
            disabled={changeStatus.isPending}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Resolve
          </Button>
        )}
```
to:
```typescript
        {/* Resolve button — only show if not resolved */}
        {conversation.status !== 'resolved' && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              resolveConversation.mutate(conversation.id, {
                onSuccess: () => {
                  void queryClient.invalidateQueries({ queryKey: ['conversations'] });
                  void queryClient.invalidateQueries({ queryKey: ['conversation', conversation.id] });
                },
              });
            }}
            disabled={resolveConversation.isPending}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Resolve
          </Button>
        )}
```

- [ ] **Step 4: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add modules/conversations/components/ConversationHeader/index.tsx
git commit -m "feat: wire resolve button to CSAT resolve endpoint"
```

---

## Task 6: Analytics Overview — CSAT Stats

**Files:**
- Modify: `app/api/analytics/overview/route.ts`
- Modify: `modules/analytics/hooks/useAnalytics.ts`

- [ ] **Step 1: Add CSAT query to analytics overview API**

In `app/api/analytics/overview/route.ts`, after the `newContacts` query block (before the `return NextResponse.json`), add:

```typescript
    // --- CSAT stats ---
    const { data: csatRaw } = await (supabase as any)
      .from('csat_responses')
      .select('score')
      .eq('workspace_id', workspaceId)
      .not('score', 'is', null)
      .gte('responded_at', `${from}T00:00:00.000Z`)
      .lte('responded_at', `${to}T23:59:59.999Z`);

    const csatRows = (csatRaw ?? []) as Array<{ score: number }>;
    const csatResponseCount = csatRows.length;
    const csatAvgScore =
      csatResponseCount > 0
        ? Math.round(
            (csatRows.reduce((sum, r) => sum + r.score, 0) / csatResponseCount) * 10,
          ) / 10
        : null;
```

- [ ] **Step 2: Add CSAT fields to the returned summary object**

In the `return NextResponse.json({...})` call, extend the `summary` object:
```typescript
      summary: {
        totalMessages,
        totalInbound,
        totalOutbound,
        deliveryRate,
        avgResponseTimeMin: 0,
        openConversations,
        resolvedConversations,
        totalContacts: totalContacts ?? 0,
        newContacts: newContacts ?? 0,
        csatAvgScore: csatAvgScore ?? null,
        csatResponseCount,
      },
```

- [ ] **Step 3: Update `AnalyticsSummary` type in useAnalytics.ts**

In `modules/analytics/hooks/useAnalytics.ts`, update the `AnalyticsSummary` interface:
```typescript
export interface AnalyticsSummary {
  totalMessages: number;
  totalInbound: number;
  totalOutbound: number;
  deliveryRate: number;
  avgResponseTimeMin: number;
  openConversations: number;
  resolvedConversations: number;
  totalContacts: number;
  newContacts: number;
  csatAvgScore: number | null;
  csatResponseCount: number;
}
```

- [ ] **Step 4: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/analytics/overview/route.ts modules/analytics/hooks/useAnalytics.ts
git commit -m "feat: add CSAT avg score and count to analytics overview"
```

---

## Task 7: CSAT Card in Analytics Dashboard

**Files:**
- Modify: `modules/analytics/components/AnalyticsDashboard/index.tsx`

- [ ] **Step 1: Add Star icon import**

Change the lucide-react import from:
```typescript
import {
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  MessageCircle,
  UserPlus,
} from 'lucide-react';
```
to:
```typescript
import {
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  MessageCircle,
  UserPlus,
  Star,
} from 'lucide-react';
```

- [ ] **Step 2: Add the CSAT SummaryCard**

In the summary cards grid section (`<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">`), add a 7th card after the "New Contacts" card. Also update the grid class to handle 7 items (change `2xl:grid-cols-6` to `2xl:grid-cols-4` on the outer grid, or just append the card — the grid wraps fine with auto). Actually, append the card to the existing grid div so it wraps naturally:

After the last `<SummaryCard ... />` in that section (the "New Contacts" one), add:

```typescript
        <SummaryCard
          title="Avg CSAT Score"
          value={
            summary?.csatAvgScore != null
              ? `${summary.csatAvgScore} / 5`
              : '—'
          }
          sub={
            summary?.csatResponseCount != null && summary.csatResponseCount > 0
              ? `${summary.csatResponseCount} response${summary.csatResponseCount === 1 ? '' : 's'}`
              : 'No responses yet'
          }
          icon={Star}
          iconBg="bg-[#f59e0b]"
          loading={isLoading}
        />
```

- [ ] **Step 3: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add modules/analytics/components/AnalyticsDashboard/index.tsx
git commit -m "feat: add CSAT score card to analytics dashboard"
```

---

## Self-Review Checklist

- [x] **DB migration** — `006_csat.sql` covers table, indexes, RLS policy
- [x] **Resolve endpoint** — resolves conversation, sends CSAT WhatsApp message, inserts pending record
- [x] **Webhook CSAT branch** — runs before rules/flow/AI, checks for null-score pending record, validates 1-5, updates score, sends thank-you, returns early
- [x] **`useResolveConversation`** — mutation calling POST `/resolve`
- [x] **ConversationHeader** — Resolve button wired to new mutation
- [x] **Analytics API** — `csatAvgScore` and `csatResponseCount` added to summary
- [x] **`AnalyticsSummary` type** — updated with two new fields
- [x] **Analytics dashboard** — CSAT card added
- [x] **TypeScript check** — called after every task
- [x] **No `(supabase as any)` missed** — admin client casts used throughout
