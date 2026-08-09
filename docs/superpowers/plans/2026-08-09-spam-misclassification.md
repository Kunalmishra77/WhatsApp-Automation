# Fix Spam Misclassification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make spam a conversation-level, engagement-gated flag (`conversations.is_spam`) that a genuine lead can never fall into — stop the sticky `'spam'` label append, upgrade the categorizer, add a Spam view, and clean up the 1,415-conversation backlog.

**Architecture:** A pure `decideSpam` rule decides spam from `{label, inboundCount, hasLead}`; the webhook writes `is_spam` on every categorized inbound and stops appending `'spam'` to `labels`; a migration adds the column + strips the bad label; the conversations list filters on `is_spam` with a new Spam tab.

**Tech Stack:** Next.js 15, TypeScript, Vitest, Supabase Postgres, React (conversations UI).

## Global Constraints

- **Spam rule (pure):** `decideSpam({label, inboundCount, hasLead}) = label === 'spam' && inboundCount === 1 && !hasLead`. Any 2nd inbound, any non-spam label, or any lead → `false`.
- `conversations.is_spam` is written on **every** categorized inbound (deterministic, self-clearing). `'spam'` is **never** appended to `conversations.labels`; the 6 real intents (billing/support/sales/complaint/inquiry/general) append exactly as today.
- Categorizer model is **`openai/gpt-4o-mini`** (hardcoded for `categorizeMessage`, not the `AI_MODEL` env which may point at the free model).
- Spam view: the "Spam" tab shows `is_spam = true`; **all other conversation views exclude `is_spam` rows**.
- Backlog: strip `'spam'` from every conversation's `labels`; leave `is_spam` at its `false` default (historical per-message signal isn't stored — forward-only detection).
- Use `(query as any).eq('is_spam', …)` where the generated Supabase types don't yet include the new column (matches the existing `(query as any)` style in that file).
- Commit after each task (Conventional Commit; end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

---

### Task 1: Pure spam rule (`lib/spam.ts`)

**Files:**
- Create: `lib/spam.ts`
- Test: `tests/spam.test.ts`

**Interfaces:**
- Produces: `decideSpam(input: { label: string | null; inboundCount: number; hasLead: boolean }): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/spam.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { decideSpam } from '../lib/spam';

describe('decideSpam', () => {
  it('true only for a first-and-only inbound categorized spam with no lead', () => {
    expect(decideSpam({ label: 'spam', inboundCount: 1, hasLead: false })).toBe(true);
  });
  it('false on a 2nd inbound (customer engaged)', () => {
    expect(decideSpam({ label: 'spam', inboundCount: 2, hasLead: false })).toBe(false);
  });
  it('false when the contact has a lead', () => {
    expect(decideSpam({ label: 'spam', inboundCount: 1, hasLead: true })).toBe(false);
  });
  it('false for any non-spam label', () => {
    for (const label of ['sales', 'general', 'inquiry', 'support', 'billing', 'complaint', null]) {
      expect(decideSpam({ label, inboundCount: 1, hasLead: false })).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/spam.test.ts`
Expected: FAIL — `Cannot find module '../lib/spam'`.

- [ ] **Step 3: Write the implementation**

Create `lib/spam.ts`:

```typescript
// lib/spam.ts — engagement-gated spam rule. A conversation is spam ONLY when a
// customer's first-and-only inbound is categorized 'spam' and they have no lead.
// Any later inbound, any non-spam intent, or any lead clears it — so a genuine,
// engaged lead can never be marked spam.
export function decideSpam(input: {
  label: string | null;
  inboundCount: number;
  hasLead: boolean;
}): boolean {
  return input.label === 'spam' && input.inboundCount === 1 && !input.hasLead;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/spam.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/spam.ts tests/spam.test.ts
git commit -m "feat(spam): pure engagement-gated spam rule

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Migration — `is_spam` column + backlog cleanup (`database/migrations/061_conversation_is_spam.sql`)

**Files:**
- Create: `database/migrations/061_conversation_is_spam.sql`

**Interfaces:**
- Produces: `conversations.is_spam boolean NOT NULL DEFAULT false`; a partial index for the spam view; the backlog label strip; the `trg_clear_spam_on_lead` trigger on `public.leads`.

- [ ] **Step 1: Write the migration**

Create `database/migrations/061_conversation_is_spam.sql`:

```sql
-- Engagement-gated spam: conversation-level flag replacing the sticky 'spam' label.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_spam boolean NOT NULL DEFAULT false;

-- Partial index: the Spam view queries the (rare) is_spam=true rows per workspace.
CREATE INDEX IF NOT EXISTS idx_conversations_is_spam
  ON public.conversations (workspace_id)
  WHERE is_spam = true;

-- Backlog cleanup: strip the bad 'spam' label from every conversation that accumulated
-- it (1,415 today, ~100% genuine). is_spam stays false for all existing rows — the
-- historical per-message spam signal was never stored, so detection is forward-only.
UPDATE public.conversations
  SET labels = array_remove(labels, 'spam')
  WHERE 'spam' = ANY(labels);

-- Lead-created clears spam: whenever a lead is created for a contact, un-spam that
-- contact's conversations. Covers every lead-creation path (message flow, Meta ad
-- leads, import, manual) so a genuine lead can never remain flagged spam even if the
-- customer never messages again.
CREATE OR REPLACE FUNCTION public.clear_conversation_spam_on_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations
    SET is_spam = false
    WHERE contact_id = NEW.contact_id AND is_spam = true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_spam_on_lead ON public.leads;
CREATE TRIGGER trg_clear_spam_on_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.clear_conversation_spam_on_lead();
```

- [ ] **Step 2: Reviewer reads the SQL (no local Postgres)**

The controller applies this migration to the live DB during post-implementation and runs the live verification. For this task, confirm the file is syntactically consistent with the repo's migration style (compare to a recent additive migration such as `database/migrations/058_tasks.sql`).

- [ ] **Step 3: Commit**

```bash
git add database/migrations/061_conversation_is_spam.sql
git commit -m "feat(spam): conversations.is_spam column + partial index + backlog label strip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Categorizer model + engagement-gated `is_spam` write (`lib/ai-reply.ts`, webhook)

**Files:**
- Modify: `lib/ai-reply.ts` (`categorizeMessage` model)
- Modify: `app/api/webhooks/whatsapp/route.ts` (the label-append block ≈ lines 815-833)

**Interfaces:**
- Consumes: `decideSpam` from `@/lib/spam` (Task 1).

- [ ] **Step 1: Upgrade the categorizer model**

In `lib/ai-reply.ts`, inside `categorizeMessage`, change the `callAI` options model from the free-model default to a hardcoded `gpt-4o-mini`. The current line reads:

```typescript
      { model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free', maxTokens: 10, temperature: 0 },
```

Change it to:

```typescript
      { model: 'openai/gpt-4o-mini', maxTokens: 10, temperature: 0 },
```

- [ ] **Step 2: Import `decideSpam` in the webhook**

At the top of `app/api/webhooks/whatsapp/route.ts`, add:

```typescript
import { decideSpam } from '@/lib/spam';
```

- [ ] **Step 3: Replace the label-append block with the spam-aware version**

Find the block (≈ lines 815-833) that currently reads:

```typescript
  // Update conversation labels async (non-blocking)
  if (intentLabel) {
    const supabaseForCat = supabase;
    const convIdForCat = conversation.id;
    (async () => {
      const { data: conv } = await (supabaseForCat as any)
        .from('conversations')
        .select('labels')
        .eq('id', convIdForCat)
        .single();
      const existing: string[] = conv?.labels ?? [];
      if (!existing.includes(intentLabel)) {
        await (supabaseForCat as any)
          .from('conversations')
          .update({ labels: [...existing, intentLabel] })
          .eq('id', convIdForCat);
      }
    })().catch(() => {});
  }
```

Replace it with (uses the `contact` in scope for the lead check — the inbound message is already persisted earlier in `processPayload`, so the inbound count includes it):

```typescript
  // Update conversation intent labels + engagement-gated spam flag (non-blocking).
  if (intentLabel) {
    const supabaseForCat = supabase;
    const convIdForCat = conversation.id;
    const contactIdForCat = contact.id;
    (async () => {
      // Append the real intent labels only — NEVER 'spam' (it is not a sticky label).
      if (intentLabel !== 'spam') {
        const { data: conv } = await (supabaseForCat as any)
          .from('conversations')
          .select('labels')
          .eq('id', convIdForCat)
          .single();
        const existing: string[] = conv?.labels ?? [];
        if (!existing.includes(intentLabel)) {
          await (supabaseForCat as any)
            .from('conversations')
            .update({ labels: [...existing, intentLabel] })
            .eq('id', convIdForCat);
        }
      }

      // Engagement-gated spam: recomputed on every categorized inbound.
      const { count: inboundCount } = await (supabaseForCat as any)
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', convIdForCat)
        .eq('direction', 'inbound');
      const { count: leadCount } = await (supabaseForCat as any)
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contactIdForCat);
      const is_spam = decideSpam({
        label: intentLabel,
        inboundCount: inboundCount ?? 0,
        hasLead: (leadCount ?? 0) > 0,
      });
      await (supabaseForCat as any)
        .from('conversations')
        .update({ is_spam })
        .eq('id', convIdForCat);
    })().catch(() => {});
  }
```

(If the contact variable at this point is named differently than `contact`, use whatever holds the resolved contact row — grep the enclosing function for the `contacts` insert/lookup. Do not introduce a new query to fetch the contact.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Do NOT run `npx next build`; the controller runs it at final review.)

- [ ] **Step 5: Commit**

```bash
git add lib/ai-reply.ts app/api/webhooks/whatsapp/route.ts
git commit -m "feat(spam): gpt-4o-mini categorizer + engagement-gated is_spam, stop appending 'spam' label

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Spam view — filter + tab (`conversation.service.ts`, `ConversationList`)

**Files:**
- Modify: `modules/conversations/services/conversation.service.ts` (`fetchConversations`)
- Modify: `modules/conversations/components/ConversationList/index.tsx` (add a Spam tab)

**Interfaces:**
- Consumes: `conversations.is_spam` (Task 2). `fetchConversations(workspaceId, status, channel)` already selects `*`, so `is_spam` rides along.

- [ ] **Step 1: Filter `is_spam` in `fetchConversations`**

In `modules/conversations/services/conversation.service.ts`, the list query currently applies the `status`/`mine`/`channel` filters. Add spam filtering so the **Spam** pseudo-status shows only spam and every other view excludes spam. After the base query is built and BEFORE it is awaited, adjust the status handling so it reads:

```typescript
  if (status === 'spam') {
    query = (query as any).eq('is_spam', true);
  } else {
    query = (query as any).eq('is_spam', false);
    if (status === 'mine') {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) query = (query as any).eq('assigned_agent_id', user.id);
    } else if (status && status !== 'all') {
      query = query.eq('status', status);
    }
  }
```

(Preserve the existing channel filter exactly as it is. This replaces the current `if (status === 'mine') … else if (status && status !== 'all') …` block; keep the same `user`-fetch logic that block already used for `'mine'`.)

- [ ] **Step 2: Add the Spam tab in `ConversationList`**

In `modules/conversations/components/ConversationList/index.tsx`, find the `<Tabs value={status} onValueChange={setStatus}>` block (≈ line 206) and add a `Spam` trigger alongside the existing tabs, following the exact markup pattern of the sibling `TabsTrigger`s already there, e.g.:

```tsx
<TabsTrigger value="spam">Spam</TabsTrigger>
```

No other UI change is needed — `setStatus('spam')` flows through `useConversations` → `fetchConversations`, which now returns only `is_spam` conversations, and all other tabs now exclude spam.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: clean. (Build is run by the controller at final review.)

- [ ] **Step 4: Commit**

```bash
git add modules/conversations/services/conversation.service.ts modules/conversations/components/ConversationList/index.tsx
git commit -m "feat(spam): Spam tab + exclude is_spam from other conversation views

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Post-implementation (controller-run)

- Full build + suite: `npx tsc --noEmit && npx vitest run && npx next build`.
- **Apply migration 061 to the live DB** (add column + index + strip `'spam'` labels) via a one-off `pg` script.
- **Live verify:** after the migration, assert (a) **0** conversations have `'spam'` in `labels`, and (b) **0** conversations have `is_spam = true` while also having a hot/warm lead (there should be no genuine lead left in spam). Confirm the `is_spam` column exists with default false.
- Push to `origin/main`, tell the user to redeploy.

## Self-review notes (coverage vs spec)

- Engagement-gated rule → Task 1 `decideSpam` + Task 3 webhook write.
- Stop appending `'spam'` + model upgrade → Task 3.
- `is_spam` column + backlog strip → Task 2 (+ controller live-apply).
- Spam view (tab + exclude from other views) → Task 4.
- Lead-created clear → Task 2 DB trigger `trg_clear_spam_on_lead` (covers every lead-creation path, incl. the edge case of a lead with no further inbound), plus the per-inbound recompute's `hasLead` check.
- Tests → Task 1 unit; controller live-verify for backlog + no-genuine-in-spam.
