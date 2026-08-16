# AI CRM Pipeline Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI drive the CRM pipeline — auto-classify a lead's stage (with a stored, overridable explanation), detect follow-ups, and detect conversions from the conversation.

**Architecture:** One gpt-4o-mini call per inbound message (on CRM-enabled workspaces, piggybacking the existing intent/sentiment block, non-blocking) yields all three signals. A pure `applyLeadClassification` computes DB writes; a cron backstop reconciles misses. New columns on `leads` + a `lead_stage_history` audit table. UI surfaces the AI badge, reasons, a needs-follow-up view, and conversion review.

**Tech Stack:** Next.js 15 (App Router, route handlers `runtime='nodejs'`), Supabase Postgres (admin client + RLS), TypeScript strict (`noUncheckedIndexedAccess`), Vitest, `callAI` (`lib/ai-client.ts`), pg_cron + pg_net.

**Spec:** `docs/superpowers/specs/2026-08-16-ai-crm-pipeline-automation-design.md`

## Global Constraints

- **Multi-tenant isolation:** the classifier uses the admin client (`services/supabase/admin.ts` `createAdminClient`), which **bypasses RLS** — every read and write MUST be filtered by `workspace_id` explicitly. Never touch a lead/contact/message outside the passed `workspaceId`.
- **Never block the bot reply:** the real-time trigger is fire-and-forget (`void` / not awaited before the reply is sent), exactly like the existing `categorizeMessage`/`updateConversationSentiment` calls.
- **Plan gate:** pipeline automation runs only when `hasFeature(plan, 'crm')` is true (`lib/plan-features.ts`).
- **Provider failover:** the classifier calls `callAI` (`lib/ai-client.ts`), never a raw provider SDK, so it inherits OpenAI→OpenRouter failover.
- **Fail closed to no-op:** any AI error, JSON parse failure, or out-of-enum stage → the classifier returns `null` and NO lead is modified. A card is never moved on bad output.
- **Stage enum is fixed:** the only valid stages are `'new','contacted','follow_up','interested','converted','lost'` (the `lead_stage` Postgres enum from migration `002_core_domain.sql`). Do not invent stages.
- **Confidence threshold:** `STAGE_CONFIDENCE_THRESHOLD = 70`. A stage MOVE happens only at/above it; below it, only metadata (confidence/reason/`ai_classified_at`) updates.
- **Migrations are append-only:** new files are `074_*.sql`, `075_*.sql`; never edit an existing migration. Applied live by the controller after review.
- **Permission gate for user-triggered endpoints:** `requireWorkspacePermission(ws, 'manage_leads')` (`lib/authz.ts`).
- **Cron auth:** POST cron routes verify `Authorization: Bearer $CRON_SECRET` (pattern from `app/api/cron/reply-sweep/route.ts`).

---

### Task 1: Migration 074 — schema + history table

**Files:**
- Create: `database/migrations/074_ai_crm_pipeline.sql`

**Interfaces:**
- Produces: new `leads` columns (`stage_source`, `stage_reason`, `ai_stage_confidence`, `ai_classified_at`, `needs_follow_up`, `follow_up_reason`, `converted_signal`, `conversion_reviewed`) and table `public.lead_stage_history(id, workspace_id, lead_id, from_stage, to_stage, source, reason, confidence, actor_id, created_at)` consumed by Tasks 2–6.

- [ ] **Step 1: Write the migration**

```sql
-- 074_ai_crm_pipeline.sql — AI CRM pipeline automation
-- Adds AI stage-classification provenance to leads + a stage-change audit trail.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stage_source VARCHAR(10) NOT NULL DEFAULT 'manual'
    CHECK (stage_source IN ('ai','manual')),
  ADD COLUMN IF NOT EXISTS stage_reason TEXT,
  ADD COLUMN IF NOT EXISTS ai_stage_confidence INTEGER
    CHECK (ai_stage_confidence IS NULL OR (ai_stage_confidence BETWEEN 0 AND 100)),
  ADD COLUMN IF NOT EXISTS ai_classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS needs_follow_up BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_reason TEXT,
  ADD COLUMN IF NOT EXISTS converted_signal TEXT,
  ADD COLUMN IF NOT EXISTS conversion_reviewed BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.lead_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_stage lead_stage,
  to_stage lead_stage NOT NULL,
  source VARCHAR(10) NOT NULL CHECK (source IN ('ai','manual')),
  reason TEXT,
  confidence INTEGER,
  actor_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead
  ON public.lead_stage_history(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_needs_follow_up
  ON public.leads(workspace_id) WHERE needs_follow_up = true;
CREATE INDEX IF NOT EXISTS idx_leads_ai_classified_at
  ON public.leads(workspace_id, ai_classified_at NULLS FIRST);

ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;

-- Mirror the workspace-isolation pattern from 049_assignment_isolation_rls.sql.
-- Reads for members of the workspace; writes come via the admin client (RLS-bypassing).
DROP POLICY IF EXISTS lead_stage_history_workspace_isolation ON public.lead_stage_history;
CREATE POLICY lead_stage_history_workspace_isolation ON public.lead_stage_history
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Verify the SQL parses / matches existing patterns**

Read `database/migrations/049_assignment_isolation_rls.sql` and `database/migrations/002_core_domain.sql` and confirm: (a) `workspace_members(workspace_id, user_id)` column names match the policy above; (b) `lead_stage` enum exists; (c) `gen_random_uuid()` is used elsewhere (it is, e.g. 072). Fix the policy subquery if the membership table/columns differ. Do NOT apply the migration (the controller applies it live).

- [ ] **Step 3: Commit**

```bash
git add database/migrations/074_ai_crm_pipeline.sql
git commit -m "feat(crm): migration 074 — AI pipeline columns + lead_stage_history"
```

---

### Task 2: Classifier core — `lib/lead-classifier.ts`

**Files:**
- Create: `lib/lead-classifier.ts`
- Test: `lib/__tests__/lead-classifier.test.ts` (match the repo's existing test dir convention — check where other `lib` tests live and follow it; if tests sit beside sources as `lib/lead-classifier.test.ts`, use that)

**Interfaces:**
- Consumes: `callAI` from `lib/ai-client.ts`; `createAdminClient` from `services/supabase/admin.ts`.
- Produces:
  - `type LeadStage = 'new'|'contacted'|'follow_up'|'interested'|'converted'|'lost'`
  - `type LeadClassification = { stage: LeadStage; confidence: number; reason: string; needs_follow_up: boolean; follow_up_reason: string | null; converted: boolean; conversion_quote: string | null }`
  - `parseClassification(raw: string): LeadClassification | null` — strict JSON parse + validation.
  - `type LeadRow = { id: string; workspace_id: string; contact_id: string | null; stage: LeadStage; follow_up_at: string | null }`
  - `type LeadWrites = { leadUpdate: Record<string, unknown>; historyRow: { from_stage: LeadStage; to_stage: LeadStage; source: 'ai'; reason: string; confidence: number } | null; promoteContact: boolean }`
  - `applyLeadClassification(lead: LeadRow, c: LeadClassification, now: Date): LeadWrites` — PURE (no I/O); computes the writes.
  - `classifyLeadPipeline(args: { conversationId: string; workspaceId: string; leadId: string }): Promise<void>` — orchestrates: load messages → build prompt → `callAI` → `parseClassification` → `applyLeadClassification` → persist (leadUpdate, insert history row, promote contact). Swallows/logs errors; never throws.
- Exports the constants `STAGE_CONFIDENCE_THRESHOLD = 70`, `FOLLOW_UP_DEFAULT_HOURS = 24`, `VALID_STAGES` (the six strings).

- [ ] **Step 1: Write failing tests for `parseClassification`**

```ts
import { describe, it, expect } from 'vitest'
import { parseClassification } from '../lead-classifier'

describe('parseClassification', () => {
  const good = JSON.stringify({
    stage: 'interested', confidence: 82, reason: 'asked price + timeline twice',
    needs_follow_up: false, follow_up_reason: null, converted: false, conversion_quote: null,
  })
  it('parses valid JSON', () => {
    const r = parseClassification(good)
    expect(r).not.toBeNull()
    expect(r!.stage).toBe('interested')
    expect(r!.confidence).toBe(82)
  })
  it('extracts JSON from a ```json fenced block', () => {
    expect(parseClassification('```json\n' + good + '\n```')?.stage).toBe('interested')
  })
  it('returns null on malformed JSON', () => {
    expect(parseClassification('not json at all')).toBeNull()
  })
  it('returns null on an out-of-enum stage', () => {
    expect(parseClassification(JSON.stringify({ ...JSON.parse(good), stage: 'super_hot' }))).toBeNull()
  })
  it('clamps confidence to 0..100', () => {
    expect(parseClassification(JSON.stringify({ ...JSON.parse(good), confidence: 150 }))?.confidence).toBe(100)
    expect(parseClassification(JSON.stringify({ ...JSON.parse(good), confidence: -5 }))?.confidence).toBe(0)
  })
  it('coerces a missing confidence to 0 and missing booleans to false', () => {
    const r = parseClassification(JSON.stringify({ stage: 'new', reason: 'x' }))
    expect(r?.confidence).toBe(0)
    expect(r?.needs_follow_up).toBe(false)
    expect(r?.converted).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib` → FAIL (module not found).

- [ ] **Step 3: Write failing tests for `applyLeadClassification`**

```ts
import { describe, it, expect } from 'vitest'
import { applyLeadClassification, type LeadRow, type LeadClassification } from '../lead-classifier'

const NOW = new Date('2026-08-16T10:00:00Z')
const lead = (over: Partial<LeadRow> = {}): LeadRow =>
  ({ id: 'L1', workspace_id: 'W1', contact_id: 'C1', stage: 'new', follow_up_at: null, ...over })
const cls = (over: Partial<LeadClassification> = {}): LeadClassification =>
  ({ stage: 'interested', confidence: 85, reason: 'r', needs_follow_up: false,
     follow_up_reason: null, converted: false, conversion_quote: null, ...over })

describe('applyLeadClassification', () => {
  it('moves stage + emits a history row when confident and changed', () => {
    const w = applyLeadClassification(lead(), cls(), NOW)
    expect(w.leadUpdate.stage).toBe('interested')
    expect(w.leadUpdate.stage_source).toBe('ai')
    expect(w.historyRow).toMatchObject({ from_stage: 'new', to_stage: 'interested', source: 'ai' })
  })
  it('does NOT move below the confidence threshold (metadata only, no history)', () => {
    const w = applyLeadClassification(lead(), cls({ confidence: 50 }), NOW)
    expect(w.leadUpdate.stage).toBeUndefined()
    expect(w.leadUpdate.ai_stage_confidence).toBe(50)
    expect(w.historyRow).toBeNull()
  })
  it('does NOT move or emit history when stage is unchanged', () => {
    const w = applyLeadClassification(lead({ stage: 'interested' }), cls(), NOW)
    expect(w.leadUpdate.stage).toBeUndefined()
    expect(w.historyRow).toBeNull()
  })
  it('conversion sets converted + closed_at + review flag + promotes contact', () => {
    const w = applyLeadClassification(lead(), cls({ converted: true, conversion_quote: 'paid via UPI' }), NOW)
    expect(w.leadUpdate.stage).toBe('converted')
    expect(w.leadUpdate.closed_at).toEqual(NOW.toISOString())
    expect(w.leadUpdate.converted_signal).toBe('paid via UPI')
    expect(w.leadUpdate.conversion_reviewed).toBe(false)
    expect(w.promoteContact).toBe(true)
    expect(w.historyRow?.to_stage).toBe('converted')
  })
  it('follow-up sets fields + a default due date when none in the future', () => {
    const w = applyLeadClassification(lead(), cls({ needs_follow_up: true, follow_up_reason: 'quiet 2d' }), NOW)
    expect(w.leadUpdate.needs_follow_up).toBe(true)
    expect(w.leadUpdate.follow_up_at).toEqual(new Date('2026-08-17T10:00:00Z').toISOString())
    expect(w.leadUpdate.follow_up_reason).toBe('quiet 2d')
  })
  it('follow-up does NOT overwrite a human-set future follow_up_at', () => {
    const future = '2026-08-20T10:00:00Z'
    const w = applyLeadClassification(lead({ follow_up_at: future }), cls({ needs_follow_up: true }), NOW)
    expect(w.leadUpdate.follow_up_at).toBeUndefined()
  })
  it('clears needs_follow_up when the AI says none is needed', () => {
    const w = applyLeadClassification(lead(), cls({ needs_follow_up: false }), NOW)
    expect(w.leadUpdate.needs_follow_up).toBe(false)
  })
})
```

- [ ] **Step 4: Run to verify failure** — FAIL.

- [ ] **Step 5: Implement `lib/lead-classifier.ts`**

Implement per the interfaces. Key logic:
- `VALID_STAGES` array; `parseClassification` strips a ```` ```json ```` fence if present, `JSON.parse` in try/catch, validates `stage ∈ VALID_STAGES` (else null), clamps `confidence` to `[0,100]` (missing→0), coerces booleans (missing→false), `reason` to string (missing→''), nullable strings default null. Returns null on any throw.
- `applyLeadClassification(lead, c, now)`:
  - Always set `leadUpdate.ai_stage_confidence = c.confidence`, `leadUpdate.stage_reason = c.reason`, `leadUpdate.ai_classified_at = now.toISOString()`.
  - **Conversion first:** if `c.converted && lead.stage !== 'converted'` → set `stage='converted'`, `stage_source='ai'`, `closed_at=now.toISOString()`, `converted_signal=c.conversion_quote`, `conversion_reviewed=false`; `historyRow = {from_stage: lead.stage, to_stage:'converted', source:'ai', reason:c.reason, confidence:c.confidence}`; `promoteContact = lead.contact_id != null`; skip the plain stage-move branch.
  - **Else stage move:** if `c.confidence >= STAGE_CONFIDENCE_THRESHOLD && c.stage !== lead.stage` → set `stage`, `stage_source='ai'`, and `historyRow`. Otherwise no stage/history.
  - **Follow-up:** if `c.needs_follow_up` → `needs_follow_up=true`, `follow_up_reason=c.follow_up_reason`; and if `lead.follow_up_at` is null or `<= now` → `follow_up_at = now + FOLLOW_UP_DEFAULT_HOURS`. Else `needs_follow_up=false`. (Follow-up fields still apply alongside a conversion? No — if converted, skip follow-up; a won lead needs none.)
  - Return `{ leadUpdate, historyRow, promoteContact }`.
- `classifyLeadPipeline`: `createAdminClient()`; load the lead (`.eq('id',leadId).eq('workspace_id',workspaceId).single()`) — if missing, return; load last ~15 messages for `conversationId` (`.eq('workspace_id',workspaceId)`, ordered, mapped to `{direction, content}`); build the prompt (below); `callAI([{role:'system',...},{role:'user', transcript}], { model: <mini>, temperature: 0, maxTokens: 200 })` — match the `callAI` signature actually in `lib/ai-client.ts` (READ it first); `parseClassification`; if null return; `applyLeadClassification(lead, c, new Date())`; `update('leads').eq('id',leadId).eq('workspace_id',workspaceId)` with `leadUpdate`; if `historyRow` insert into `lead_stage_history` with `workspace_id, lead_id, actor_id:null`; if `promoteContact` update `contacts.lifecycle_stage='customer'` `.eq('id',lead.contact_id).eq('workspace_id',workspaceId)`. Wrap everything in try/catch that logs and returns (never throws).

Prompt (system): give the six stages with one-line definitions (new=just arrived; contacted=we replied, no clear interest yet; follow_up=waiting on us / went quiet after engaging; interested=explicit buying signals/questions about price/booking; converted=confirmed purchase/booking/payment in chat; lost=explicitly declined/unreachable/not interested). Instruct: return ONLY strict JSON with keys `stage, confidence (0-100), reason (<=140 chars), needs_follow_up, follow_up_reason, converted, conversion_quote`; `converted=true` only on an explicit in-chat confirmation, quoting the customer line; `needs_follow_up=true` when the customer is waiting or has gone quiet after showing interest. Keep the reason specific and short.

- [ ] **Step 6: Run tests to verify pass** — `npx vitest run lib` → PASS.

- [ ] **Step 7: `npx tsc --noEmit`** → clean.

- [ ] **Step 8: Commit** — `feat(crm): lead pipeline classifier (parse + apply + orchestrate)`

---

### Task 3: Real-time trigger in the webhooks

**Files:**
- Modify: `app/api/webhooks/whatsapp/route.ts` (the post-store classification block, ~875-914, where `categorizeMessage`/`updateConversationSentiment` are called)
- Modify: `app/api/webhooks/instagram/route.ts` (the analogous block)

**Interfaces:**
- Consumes: `classifyLeadPipeline` (Task 2), `hasFeature` (`lib/plan-features.ts`), the workspace plan + the lead id already resolved by `autoCreateOrUpdateLead`.

- [ ] **Step 1: Read the call sites** — Read the WhatsApp webhook around the classification block and `autoCreateOrUpdateLead` (1215-1273) to get the exact variables in scope: `workspaceId`, `conversationId`, the plan, and the lead id (or how to fetch it for the contact). Read the Instagram webhook's equivalent.

- [ ] **Step 2: Wire the WhatsApp trigger (non-blocking)**

After the existing intent/sentiment fire-and-forget calls, and only when a lead exists for this contact/conversation and `hasFeature(plan,'crm')`, add:

```ts
// Fire-and-forget: AI pipeline classification (never blocks the reply)
if (leadId && hasFeature(plan, 'crm')) {
  void classifyLeadPipeline({ conversationId, workspaceId, leadId })
    .catch((e) => console.error('[crm] classifyLeadPipeline failed', e))
}
```

Match the surrounding style (how the other classifiers are invoked — `void`, `.catch`, or pushed into a `Promise.allSettled` batch). If `leadId` isn't already in scope, derive it from the lead that `autoCreateOrUpdateLead` creates/updates (have that helper return the lead id, or query `leads` by `conversation_id`+`workspace_id`). Do not add an `await` on the reply path.

- [ ] **Step 3: Wire the Instagram trigger** — the same guarded, non-blocking call in the Instagram webhook's classification block.

- [ ] **Step 4: `npx tsc --noEmit`** → clean. (No new unit test — this is wiring; covered by integration/live testing. Confirm the webhook route still type-checks and the call is not awaited.)

- [ ] **Step 5: Commit** — `feat(crm): classify lead pipeline on inbound (whatsapp + instagram)`

---

### Task 4: On-demand + cron reclassification endpoints

**Files:**
- Create: `app/api/leads/[id]/classify/route.ts` (POST — permission-gated on-demand "Re-analyze")
- Create: `app/api/cron/reclassify-leads/route.ts` (POST — CRON_SECRET, batch backstop)
- Create: `database/migrations/075_reclassify_cron.sql` (pg_cron schedule, mirroring `057_reply_sweep_cron.sql`)

**Interfaces:**
- Consumes: `classifyLeadPipeline` (Task 2), `requireWorkspacePermission`/`hasFeature`, `createAdminClient`, the CRON_SECRET pattern.

- [ ] **Step 1: On-demand classify route** — Read `app/api/leads/[id]/route.ts` for the auth/workspace-resolution + gate pattern, then create `classify/route.ts`: resolve the lead by id, resolve its workspace, `requireWorkspacePermission(ws,'manage_leads')` + `hasFeature(plan,'crm')`, look up the lead's `conversation_id`, `await classifyLeadPipeline({...})`, return the refreshed lead (or `{ ok: true }`). `export const runtime = 'nodejs'`.

- [ ] **Step 2: Cron backstop route** — Read `app/api/cron/reply-sweep/route.ts` for the Bearer-secret check, then create `reclassify-leads/route.ts`: verify `Authorization: Bearer $CRON_SECRET` (401 otherwise); with the admin client, select up to 100 leads on CRM-enabled workspaces that have inbound activity since `ai_classified_at` (or `ai_classified_at IS NULL`), ordered by `ai_classified_at NULLS FIRST`; for each, `await classifyLeadPipeline(...)` (sequential or small-concurrency; each already swallows its own errors); return `{ processed: n }`. Determine "CRM-enabled workspace" the same way the app resolves a workspace plan (READ how another cron route filters by plan/feature; if there's no cheap SQL flag, join the workspace + compute `hasFeature` in JS over the batch). Keep it single-pass, no lock needed (idempotent updates).

- [ ] **Step 3: Cron migration 075** — mirror `057_reply_sweep_cron.sql`: schedule a pg_cron job every 15 min that `pg_net`-POSTs the route with the `app.cron_secret` bearer. Copy the exact `cron.schedule` + `net.http_post` shape from `057`; change the path to `/api/cron/reclassify-leads` and the job name. If `app.base_url`/`app.cron_secret` settings are known-unreliable (see project memory on inline secret), follow whatever `057` currently does in this repo verbatim.

- [ ] **Step 4: `npx tsc --noEmit`** → clean.

- [ ] **Step 5: Commit** — `feat(crm): on-demand + cron lead reclassification`

---

### Task 5: Manual stage changes write provenance + history

**Files:**
- Modify: `app/api/leads/[id]/route.ts` (the PATCH that accepts `stage`)
- Modify: `modules/crm/services/lead.service.ts` (`updateLeadStage`) — if the Kanban drag persists through the service rather than the PATCH route, update whichever path actually writes `stage`.

**Interfaces:**
- Consumes: `lead_stage_history` (Task 1).

- [ ] **Step 1: Read both write paths** — Confirm whether the Kanban drag calls `PATCH /api/leads/[id]` (`useMoveLeadStage`) or `lead.service.updateLeadStage`. Whichever writes `stage`, that's the one to augment. (Per the codebase map the PATCH route is admin-client + permission-gated; the service is the RLS client.)

- [ ] **Step 2: On a manual stage change, set provenance + log history** — When a PATCH/service call changes `stage`: read the current stage first; set `stage_source='manual'`; and insert a `lead_stage_history` row `{workspace_id, lead_id, from_stage: current, to_stage: new, source:'manual', reason: null, confidence: null, actor_id: <current user id>}`. Only log when the stage actually changes. Keep the existing permission/feature gates.

- [ ] **Step 3: `npx tsc --noEmit`** → clean. Add/extend a unit or route test only if the repo already tests this route; otherwise rely on the type check + the manual-history assertion in live testing.

- [ ] **Step 4: Commit** — `feat(crm): record manual stage changes in lead_stage_history`

---

### Task 6: CRM UI — AI badge, history, follow-up view, conversion review

**Files:**
- Modify: `modules/crm/components/LeadCard.tsx` (AI badge + conversion-review flag)
- Modify: `modules/crm/components/LeadDetail.tsx` (pipeline-history timeline + Re-analyze button + conversion confirm/undo)
- Modify: `modules/crm/components/KanbanBoard/index.tsx` (a "Needs follow-up" filter/tab + count badge)
- Modify: `modules/crm/hooks/useLeads.ts` (a `useReclassifyLead` mutation → `POST /api/leads/[id]/classify`; a fetch for `lead_stage_history`; the needs-follow-up query)
- Create (if needed): `app/api/leads/[id]/conversion/route.ts` (POST `{ action: 'confirm' | 'undo' }`) OR fold confirm/undo into the existing PATCH — pick the smaller change; confirm sets `conversion_reviewed=true`; undo reverts `stage` to the latest history row's `from_stage`, clears `converted_signal`/`closed_at`, sets `conversion_reviewed=true`, and writes a `manual` history row.

**Interfaces:**
- Consumes: the new `leads` fields + `lead_stage_history` (Task 1), the classify endpoint (Task 4).

- [ ] **Step 1: Read the CRM components** — `LeadCard`, `LeadDetail`, `KanbanBoard/index.tsx`, `useLeads.ts`, and `lead.service.ts` types, so the new fields thread through the existing `Lead` type. Add the new columns to the lead type/select.

- [ ] **Step 2: Lead card** — when `stage_source === 'ai'`, render a small "AI" badge (reuse existing badge styling). When `stage === 'converted' && !conversion_reviewed`, render an "AI-marked · review" pill.

- [ ] **Step 3: Lead detail** — a **Pipeline history** section listing `lead_stage_history` (newest first: `from → to`, source AI/manual, reason, confidence, time). A **Re-analyze** button calling `useReclassifyLead`. For an unreviewed conversion: **Confirm win** + **Undo** buttons wired to the conversion endpoint/PATCH.

- [ ] **Step 4: Needs-follow-up view** — a tab/filter on the Kanban (or the CRM list) showing leads with `needs_follow_up=true` (or `follow_up_at <= now`) and stage not in (`converted`,`lost`), with a count badge; each shows `follow_up_reason`. Reuse the existing filter-pill pattern (`TEMP_FILTERS`).

- [ ] **Step 5: Conversion confirm/undo endpoint** (if separate) — implement per the file note above; permission-gated + `hasFeature`; workspace-scoped; undo writes a `manual` history row.

- [ ] **Step 6: `npx tsc --noEmit`** → clean; run `npx vitest run` (full suite) → green.

- [ ] **Step 7: Commit** — `feat(crm): AI badge, pipeline history, follow-up view, conversion review UI`

---

## Self-Review

**Spec coverage:** stage classification + explanation (Tasks 1,2,6), full-auto with confidence guard (Task 2), override/provenance (Tasks 1,5), history/audit (Tasks 1,5,6), follow-up detect + flag+remind view (Tasks 2,6), conversion-from-chat + review/undo (Tasks 2,6), real-time trigger (Task 3), cron backstop + on-demand (Task 4), RLS/isolation + gates + failover + fail-closed (Global Constraints, Task 2), cost/non-blocking (Task 3). Covered.

**Placeholder scan:** each code step has real SQL/TS or a concrete "read X then do Y" with exact fields; the few "read the call site first" steps are unavoidable (webhook internals) and name the exact block/lines.

**Type consistency:** `LeadStage`/`LeadClassification`/`LeadRow`/`LeadWrites` are defined in Task 2 and consumed by 3–6; `lead_stage_history` columns are fixed in Task 1 and referenced identically after. `classifyLeadPipeline` signature is stable across Tasks 2,3,4. `STAGE_CONFIDENCE_THRESHOLD=70`, `FOLLOW_UP_DEFAULT_HOURS=24` named once, reused.

**Open reads the implementers MUST do (named in-task):** the exact `callAI` signature in `lib/ai-client.ts`; the webhook classification block variables; which path persists a Kanban drag; the `057` cron SQL shape; the repo's `lib` test-file location convention.
