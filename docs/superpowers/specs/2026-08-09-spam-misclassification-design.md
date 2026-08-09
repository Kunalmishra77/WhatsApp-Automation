# Fix Spam Misclassification — Engagement-Gated Spam

**Date:** 2026-08-09
**Status:** Approved design, pending implementation plan

## Problem

Genuine, engaged leads are showing up as "spam". Proven root cause (live data):
**1,415 conversations carry the `'spam'` label, and ~100% are genuine** — e.g. Razorveda
642 spam-labeled / 642 with hot-or-warm leads, VMS 290/290, Umang 260/260.

Two compounding defects:
1. **`labels` is a cumulative append-log, not a classification.** Every inbound message is
   AI-categorized (billing/support/sales/complaint/inquiry/**spam**/general) and the label is
   *appended* to `conversations.labels`, deduped only exactly, **never removed**. Over a long
   thread the array accumulates every category, so a 900-message genuine conversation ends up
   `["inquiry","support","complaint","general","spam","billing","sales"]`. "Has the `'spam'`
   label" therefore means "≥1 of hundreds of messages was ever tagged spam" — true of nearly
   every engaged conversation.
2. **Weak categorizer model.** `categorizeMessage` uses `gpt-oss-120b:free` (the code comment
   even falsely claims `gpt-4o-mini`), which over-tags genuine messages as spam often enough
   that, over a long thread, at least one always lands.

## Goal

Redefine spam as a conversation-level, **engagement-gated** verdict that a genuine/engaged lead
can never fall into; stop the sticky-label append; upgrade the categorizer; and clean up the
1,415-conversation backlog.

## Decisions (from brainstorming)

1. **Engagement-gated auto spam** (not a per-message sticky label): a conversation is spam only
   with zero genuine engagement; any engagement auto-clears it, permanently.
2. **Backlog:** un-spam all engaged conversations now (≈ all 1,415).
3. **Upgrade the categorizer to `gpt-4o-mini`.**

## Non-goals (YAGNI)

- Conservative by design: favors "never hide a real lead" over catching every spammer.
  Multi-message junk is not auto-flagged — agents mark those manually (existing label/mark
  mechanisms are unchanged).
- No new spam ML / no per-message spam history table. Backlog spam signal is not recomputed
  (the historical per-message category was never stored); new detection is forward-only.

## The spam rule (pure)

`lib/spam.ts` — `decideSpam({ label, inboundCount, hasLead }): boolean`:

```
return label === 'spam' && inboundCount === 1 && !hasLead;
```

- `label` — the categorizer's result for THIS inbound message.
- `inboundCount` — number of inbound (customer) messages in this conversation, including this one.
- `hasLead` — the contact has any lead row.

So spam is `true` only for a first-and-only inbound categorized spam with no lead; a 2nd inbound,
any non-spam label, or a lead all yield `false`. The webhook writes `is_spam = decideSpam(...)`
on every categorized inbound, so the flag is deterministic and self-clearing.

## Changes

### 1. Source: model + stop appending `'spam'` (`lib/ai-reply.ts`, webhook)

- `categorizeMessage`: model → `gpt-4o-mini` (via the existing `callAI`; keep the 7-label prompt
  so `'spam'` is still detectable as a signal).
- Webhook label block (`app/api/webhooks/whatsapp/route.ts` ≈ lines 815-833): **only append the
  label when it is NOT `'spam'`** (the 6 real intents keep working exactly as today). The
  `'spam'` result no longer touches `labels`.

### 2. Engagement-gated `is_spam` (webhook)

- New column `conversations.is_spam boolean NOT NULL DEFAULT false`.
- In the same categorize path, when there is a categorizer result, compute
  `inboundCount` (count of inbound messages for the conversation) and `hasLead` (a lead exists
  for the contact), then `UPDATE conversations SET is_spam = decideSpam({ label, inboundCount,
  hasLead })` for this conversation. (Runs in the existing async, non-blocking label task.)
- **Lead-created clear:** where a lead is first created for a contact (the lead upsert path used
  by `detectLeadTemperature` / the lead engine), also set that contact's open conversation
  `is_spam = false`. (Belt-and-suspenders; the per-inbound rule already clears on the next
  message.) Exact call site pinned in the plan.

### 3. Spam view

- The conversations list data source (`useConversations`, feeding
  `modules/conversations/components/ConversationList`) must include `is_spam` on each row.
- `ConversationList` gains a **"Spam" filter** — a new entry in its existing status `Tabs`
  (or an adjacent toggle) that shows only `is_spam === true` conversations, and the default/
  "all" views EXCLUDE `is_spam` conversations (so junk doesn't clutter the main inbox). Filtering
  is client-side alongside the existing `filtered` memo, since `is_spam` now rides on each row.
- Exact list endpoint/hook file pinned in the plan.

### 4. Backlog cleanup (migration)

In the same migration that adds the column:
- `UPDATE public.conversations SET labels = array_remove(labels, 'spam') WHERE 'spam' = ANY(labels);`
  — strips the bad label from all 1,415.
- `is_spam` stays its `false` default for all existing rows (historical spam signal is
  unavailable to recompute; ~100% are engaged anyway, so `false` is correct). New spam accrues
  forward-only.

## Testing

- **Unit (`tests/spam.test.ts`):** `decideSpam` truth table — `true` only for
  `{label:'spam', inboundCount:1, hasLead:false}`; `false` for a 2nd inbound
  (`inboundCount:2`), for a lead (`hasLead:true`), and for any non-spam label
  (`'sales'`/`'general'`/…). Boundary at `inboundCount` 1 vs 2.
- **Live verification (scripted, controller):** after the backlog migration, assert **0**
  conversations have `is_spam = true` while also having a hot/warm lead; and confirm no
  conversation still has `'spam'` in `labels`.

## Rollout

- Migration (add column + backlog cleanup) applied live by the controller; code change requires
  redeploy. Additive column with a default — safe. Existing label/manual-mark flows unchanged.
