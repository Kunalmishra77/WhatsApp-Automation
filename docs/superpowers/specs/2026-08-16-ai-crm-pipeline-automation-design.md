# AI CRM Pipeline Automation — Design Spec

**Date:** 2026-08-16
**Status:** Design approved (design confirmed in chat); pending spec review → writing-plans
**Part of:** Public SaaS Transformation — Project C (A: onboarding ✓, B: marketing website ✓, C: this)

## Problem

The CRM pipeline is entirely manual. `leads.stage` (the Kanban columns:
`new → contacted → follow_up → interested → converted → lost`) only ever changes when a
human drags a card. Nobody scores which leads are going cold, and a "won" deal is recorded
only if someone remembers to move the card. The AI already reads every inbound message to
classify **intent** and **sentiment** (non-blocking, gpt-4o-mini, in the WhatsApp/Instagram
webhook) — but it never touches the pipeline. Project C makes the AI drive the pipeline:
auto-classify the stage with a stored explanation, detect when a lead needs a follow-up, and
detect a conversion from the conversation — all overridable by the user.

## Locked decisions (confirmed with the user)

1. **Full-auto stage moves.** The AI sets `leads.stage` directly from the conversation, even
   re-moving a card a human moved — **but only when confident** (a confidence threshold guards
   against thrash). Every move stores the AI's reason and is logged to a history table. A manual
   drag still works and is recorded as `source='manual'`; it is **not** sticky (the AI may
   reclassify on later activity). `stage_source` + the history table make a future "manual hold"
   toggle a small change, not a rebuild.
2. **Follow-up = flag + remind (no auto-send).** When the AI judges a lead is waiting on the team
   / has gone quiet, it sets `needs_follow_up=true`, a `follow_up_at` due time, and a reason. These
   surface in a "Needs follow-up" CRM view (count badge) and the existing daily-digest cron. The AI
   does **not** send any WhatsApp message itself.
3. **Conversion detected from chat.** SMB payments are mostly offline (counter/cash/UPI), so
   conversion is judged from the conversation ("booked", "paid", "done thanks"), not a payment
   webhook. On detection: `stage=converted`, `closed_at=now`, the contact is promoted to
   `lifecycle_stage='customer'`, the triggering quote is stored, and the card is flagged
   **AI-marked · review** (`conversion_reviewed=false`) for one-tap confirm/undo.

## Architecture — one classifier, three signals

Stage, follow-up, and conversion are all reads of the same conversation, so a **single AI call**
produces all three. It runs in the **same non-blocking block** the webhook already uses for
intent + sentiment (`app/api/webhooks/whatsapp/route.ts` ~875-890, and the Instagram webhook),
so it adds **zero latency to the bot reply**.

### The classifier — `lib/lead-classifier.ts`

`classifyLeadPipeline({ conversationId, workspaceId, leadId }): Promise<LeadClassification | null>`

- Loads the recent messages for the conversation (both directions, capped, oldest→newest).
- Builds a tight prompt: the six stage definitions, a one-line business/industry context, and the
  transcript. Asks for **strict JSON**.
- Calls **`callAI`** (`lib/ai-client.ts`) — so it rides the provider **failover** (OpenAI→OpenRouter).
  Model: the cheap classifier tier (gpt-4o-mini), same as intent/sentiment.
- Returns validated:
  ```ts
  type LeadClassification = {
    stage: LeadStage            // one of the six enum values
    confidence: number          // 0..100
    reason: string              // ≤140 chars, why this stage
    needs_follow_up: boolean
    follow_up_reason: string | null   // ≤140 chars
    converted: boolean
    conversion_quote: string | null   // the customer line that signals the win
  }
  ```
- **On any AI/parse/validation failure → returns `null` (no-op).** A card is never moved on
  malformed output or an AI outage.

### Applying the classification — `applyLeadClassification()`

Pure-ish function that takes the classification + current lead and computes the DB writes (unit-testable
without the network):

- **Stage:** if `confidence >= STAGE_CONFIDENCE_THRESHOLD` (default **70**) and `stage` differs from
  the current stage → set `leads.stage`, `stage_source='ai'`, `stage_reason`, `ai_stage_confidence`,
  `ai_classified_at=now`, and insert a `lead_stage_history` row. If below threshold or unchanged →
  update `ai_stage_confidence`/`reason`/`ai_classified_at` only (no move, no history row).
- **Follow-up:** if `needs_follow_up` and the lead is not `converted`/`lost` → set
  `needs_follow_up=true`, `follow_up_reason`, and `follow_up_at = now + FOLLOW_UP_DEFAULT_HOURS`
  (default **24h**) **only if `follow_up_at` is null or in the past** (don't stomp a human-set date).
  If the AI says no follow-up needed, clear `needs_follow_up=false` (leave `follow_up_at`).
- **Conversion:** if `converted` and current stage is not already `converted` → set
  `stage='converted'`, `stage_source='ai'`, `closed_at=now`, `converted_signal=conversion_quote`,
  `conversion_reviewed=false`, `stage_reason`, history row (`to_stage='converted'`), and promote the
  contact (`contacts.lifecycle_stage='customer'`). Conversion takes precedence over the plain stage
  write when both are present.

All writes go through the **admin client** but are **always** filtered by `workspace_id` (the admin
client bypasses RLS — isolation is manual, per the established pattern in the webhooks).

### Triggers

1. **Real-time (primary):** in the webhook's existing post-store classification block, after intent +
   sentiment, fire `classifyLeadPipeline` for the contact's lead **only when a lead exists** (or was
   just auto-created by `autoCreateOrUpdateLead`) and `hasFeature(plan,'crm')`. Non-blocking
   (`void`/`Promise.allSettled`), never awaited before the reply. Skips the same guards intent/sentiment
   skip (spam, suspended, etc.). Same wiring added to the Instagram webhook.
2. **Cron backstop (resilience):** a new `app/api/cron/reclassify-leads` route (POST, `CRON_SECRET`
   Bearer, pg_cron every ~15 min) reclassifies leads on CRM-enabled workspaces whose lead had **inbound
   activity since `ai_classified_at`** (or `ai_classified_at is null`), capped to a batch (e.g. 100
   leads/run, oldest-classified first). Catches real-time misses and retries after an AI outage. Reuses
   the CRON_SECRET pattern from `057_reply_sweep_cron.sql` / `app/api/cron/reply-sweep`.

## Data model — migration `074_ai_crm_pipeline.sql`

Latest existing migration is `073`; this is `074`.

Add to `public.leads`:
- `stage_source VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (stage_source IN ('ai','manual'))`
- `stage_reason TEXT`
- `ai_stage_confidence INTEGER CHECK (ai_stage_confidence BETWEEN 0 AND 100)`
- `ai_classified_at TIMESTAMPTZ`
- `needs_follow_up BOOLEAN NOT NULL DEFAULT false`
- `follow_up_reason TEXT`
- `converted_signal TEXT`
- `conversion_reviewed BOOLEAN NOT NULL DEFAULT false`

New table `public.lead_stage_history` (the "why did this move?" audit trail):
```sql
CREATE TABLE public.lead_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_stage lead_stage,
  to_stage lead_stage NOT NULL,
  source VARCHAR(10) NOT NULL CHECK (source IN ('ai','manual')),
  reason TEXT,
  confidence INTEGER,
  actor_id UUID REFERENCES auth.users(id),   -- null for AI
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_stage_history_lead ON public.lead_stage_history(lead_id, created_at DESC);
CREATE INDEX idx_leads_needs_follow_up ON public.leads(workspace_id) WHERE needs_follow_up = true;
```
RLS on `lead_stage_history`: enable RLS + a `workspace_isolation` policy mirroring migration
`049_assignment_isolation_rls.sql` (workspace-scoped; read for members of the workspace). Inserts come
from the admin client (RLS-bypassing) so a permissive-authenticated-read policy is sufficient.

## Reused (no rebuild)
- `lib/ai-client.ts` `callAI` (+ failover), `lib/ai-reply.ts` classification patterns
  (`categorizeMessage`/`updateConversationSentiment` are the template for the new call).
- `autoCreateOrUpdateLead` + the webhook classification block (real-time trigger site).
- `modules/crm/services/lead.service.ts` (`LEAD_STAGES`, `STAGE_LABELS`), `KanbanBoard`, `LeadDetail`,
  `useLeads` hooks — extended, not replaced.
- Manual stage PATCH `app/api/leads/[id]/route.ts` — extend to write `stage_source='manual'` +
  a history row + `actor_id`.
- Cron pattern (`CRON_SECRET` Bearer + pg_cron) from `057`/`app/api/cron/reply-sweep`.
- `hasFeature(plan,'crm')` + `requireWorkspacePermission(ws,'manage_leads')` gates.
- Daily-digest cron for the follow-up reminder surface.

## UI changes (`modules/crm`)
- **Lead card:** when `stage_source='ai'`, a small **AI** badge; `conversion_reviewed=false` +
  `stage='converted'` shows an **AI-marked · review** flag with confirm/undo.
- **Lead detail:** a **Pipeline history** timeline from `lead_stage_history` (AI vs manual, each with its
  reason + confidence); a **Re-analyze** button → calls a `POST /api/leads/[id]/classify` that runs the
  classifier on demand (permission-gated).
- **Needs-follow-up view:** a tab/filter on the CRM listing leads where `needs_follow_up=true`
  (or `follow_up_at <= now`) and stage not in (`converted`,`lost`), with a count badge; each row shows
  the `follow_up_reason`.
- **Conversion review:** confirm sets `conversion_reviewed=true`; undo reverts stage to the prior
  history entry's `from_stage` and clears the conversion fields (writes a `manual` history row).
- Manual drag → `stage_source='manual'` + history row (already routes through the PATCH endpoint).

## Multi-tenant & security
- Every classifier read/write is `workspace_id`-scoped even through the admin client (RLS bypassed).
- The on-demand `classify` + conversion confirm/undo endpoints are permission-gated
  (`requireWorkspacePermission(ws,'manage_leads')`) and `hasFeature(plan,'crm')`; a user only ever
  classifies leads in their own workspace.
- The cron route is `CRON_SECRET`-guarded (Bearer), never public.
- No cross-tenant surface; `lead_stage_history` is workspace-isolated by RLS.

## Cost & performance
- One extra gpt-4o-mini call per inbound message **only on CRM-enabled workspaces with a lead** —
  parallel with the existing intent/sentiment calls, never blocking the reply.
- The cron backstop is batch-capped (≤100 leads/run) and single-pass; no queue/worker introduced.

## Error handling
- Classifier AI/parse failure → `null`, no writes (card unchanged). Logged, retried by the cron backstop.
- Confidence below threshold → no stage move (metadata-only update).
- AI proposes an invalid stage value → rejected by enum validation → treated as failure (no move).
- Follow-up write never overwrites a human-set future `follow_up_at`.
- Conversion undo restores the pre-conversion stage from history.
- Provider outage (the recent incident) → classifier no-ops via failover-then-null; nothing breaks; the
  cron backstop reconciles once AI recovers.

## Testing
- **Unit:** `applyLeadClassification` transitions — confident-move vs below-threshold no-move; conversion
  path (stage/closed_at/contact promotion/flag); follow-up date guard (doesn't stomp a future date);
  invalid-stage rejection; history-row emission on move only.
- **Unit:** classifier JSON parsing/validation — good JSON, malformed JSON → null, out-of-enum stage → null,
  confidence clamp.
- **Integration/live:** inbound message on a CRM workspace → lead reclassified with reason; a "booked/paid"
  message → converted + contact promoted + review flag; a going-quiet lead flagged for follow-up; manual
  drag records a `manual` history row; cron backstop reclassifies a stale lead; workspace isolation
  (a workspace never classifies another's leads); non-CRM plan → classifier never runs.
- **Security:** on-demand classify/confirm/undo endpoints reject cross-workspace + insufficient permission;
  cron route rejects a missing/wrong secret.

## Out of scope (later)
- AI auto-**sending** follow-up messages (schema-ready via the follow-up fields; a per-workspace toggle
  flips it on later).
- "Manual hold" stickiness (a 24h lock before AI can override a manual move) — `stage_source` + history
  make it additive.
- Re-scoring `ai_score` with an LLM (stays rule-based), temperature model changes, and the
  `contacts.temperature` latent-column cleanup (tracked separately).
- Predictive/next-best-action suggestions, revenue forecasting.

## Self-review notes
- One AI call → three signals keeps cost at ~one extra mini-call and avoids three separate passes.
- `callAI` (not a raw provider call) means the classifier inherits the just-shipped failover — the
  outage that motivated it won't silently kill pipeline automation.
- Full-auto is honored literally (AI can re-move manual cards) but guarded by a confidence threshold so
  it doesn't flap; `stage_source` + history preserve the override signal and the audit trail, so the
  "manual hold" the user deferred is a later toggle, not a rebuild.
- Conversion-from-chat fits the offline-payment SMB reality; the review flag keeps the numbers honest.
- Reuses the existing webhook classification site, cron pattern, RLS pattern, and CRM UI — smallest
  footprint that delivers the three behaviors.
