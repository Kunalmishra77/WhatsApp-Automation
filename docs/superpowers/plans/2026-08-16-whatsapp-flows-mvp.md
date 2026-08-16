# Native WhatsApp Flows MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a workspace publish a native Meta WhatsApp "Lead Capture" form, send it into a conversation, and capture the customer's submission onto the contact/lead + thread — using non-endpoint flows (no cryptography).

**Architecture:** Non-endpoint Meta Flows: the Flow JSON (all screens) is published to the client's WABA via the Graph API; the `flow` interactive message is sent with an opaque `flow_token`; the completed form returns once as an `nfm_reply` inbound webhook message, matched back via a `flow_sessions_native` row. No data-exchange endpoint, no RSA keys.

**Tech Stack:** Next.js 15 route handlers (`runtime='nodejs'`), Supabase Postgres, TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, WhatsApp Graph API v19.0.

**Spec:** `docs/superpowers/specs/2026-08-16-whatsapp-flows-mvp-design.md`

## Global Constraints

- **Naming:** UI section is **"WhatsApp Forms"** (NOT "Flows" — avoid collision with the existing homegrown chatbot-flow builder). Code/routes use `flows-native` / `native-flows` / `flows_meta` / `flow_sessions_native`.
- **Auth/scoping:** publish route → `requireWorkspacePermission(workspaceId, 'create_campaigns')`; send route → `handle_conversations` + suspension guard (`assertWorkspaceActive`/`suspendedResponse`). All queries `.eq('workspace_id', workspaceId)`. Routes use `createAdminClient` where they mirror existing send routes.
- **Webhook safety:** the `nfm_reply` branch MUST be try/catch fail-open and `return`/short-circuit (never break ingestion or the AI reply pipeline, never double-reply) — mirror the `order` branch added in `app/api/webhooks/whatsapp/route.ts`.
- **Graph API:** base `https://graph.facebook.com/v19.0`; use the workspace's own `access_token` (BOM-strip `.replace(/﻿/g,'').trim()`) + `phone_number_id`/`waba_id` from `workspaces`.
- Windows: Bash for `npx tsc --noEmit` (slow — allow 5 min), `npx vitest run`, `git`. Do NOT run `npx next build`.
- Migrations: additive, idempotent (`IF NOT EXISTS`), REVOKE not needed (regular tables, RLS per existing pattern).

---

### Task 1: Migration — `flows_meta` + `flow_sessions_native`

**Files:**
- Create: `database/migrations/071_native_flows.sql`

**Interfaces:**
- Produces tables: `flows_meta(id uuid pk, workspace_id uuid, template_key text, meta_flow_id text, name text, status text, created_at, updated_at)` UNIQUE`(workspace_id, template_key)`; `flow_sessions_native(id uuid pk, workspace_id uuid, conversation_id uuid, contact_id uuid, flow_token text unique, template_key text, meta_flow_id text, status text default 'sent', response jsonb, created_at, completed_at)`.

- [ ] **Step 1:** Write `071_native_flows.sql`:

```sql
-- 071_native_flows.sql — native Meta WhatsApp Flows (non-endpoint) MVP.
CREATE TABLE IF NOT EXISTS public.flows_meta (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  template_key  text NOT NULL,
  meta_flow_id  text,
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'draft',   -- draft | published | deprecated
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, template_key)
);
CREATE INDEX IF NOT EXISTS idx_flows_meta_ws ON public.flows_meta (workspace_id);

CREATE TABLE IF NOT EXISTS public.flow_sessions_native (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id     uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  flow_token     text NOT NULL UNIQUE,
  template_key   text NOT NULL,
  meta_flow_id   text,
  status         text NOT NULL DEFAULT 'sent',    -- sent | completed
  response       jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_flow_sessions_native_token ON public.flow_sessions_native (flow_token);
CREATE INDEX IF NOT EXISTS idx_flow_sessions_native_ws ON public.flow_sessions_native (workspace_id);

ALTER TABLE public.flows_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_sessions_native ENABLE ROW LEVEL SECURITY;
-- Service-role admin client is used by all routes; deny direct client access.
DROP POLICY IF EXISTS flows_meta_no_client ON public.flows_meta;
CREATE POLICY flows_meta_no_client ON public.flows_meta FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS flow_sessions_native_no_client ON public.flow_sessions_native;
CREATE POLICY flow_sessions_native_no_client ON public.flow_sessions_native FOR ALL USING (false) WITH CHECK (false);
```

- [ ] **Step 2:** Re-read: confirm idempotent (`IF NOT EXISTS`), FKs, unique constraints, RLS deny-all (routes use admin client). No app test (SQL only).
- [ ] **Step 3: Commit** `feat(flows): migration 071 — native flows tables`.
- [ ] **Step 4 (controller, live):** apply 071 to the live DB via the scratchpad `pg` pattern; verify both tables exist.

---

### Task 2: Flow JSON template builder + helpers (pure, unit-tested)

**Files:**
- Create: `lib/native-flows.ts`
- Test: `lib/native-flows.test.ts`

**Interfaces:**
- Produces:
  - `buildLeadCaptureFlowJson(): object` — returns a valid non-endpoint Flow JSON (version "5.1", one screen `LEAD_CAPTURE`, components: TextInput `full_name` (required), TextInput `phone` (input-type phone), TextInput `email` (input-type email, optional), TextArea `interest` (optional), Footer button action `complete` with `payload` mapping each field). `terminal: true` screen.
  - `NATIVE_FLOW_TEMPLATES: Record<string,{ key:string; name:string; firstScreen:string; buildJson:()=>object }>` — MVP has one entry `lead_capture`.
  - `parseNfmReply(responseJson: string): { flow_token: string | null; fields: Record<string,string> }` — safely parses the `nfm_reply.response_json` string; returns `{flow_token:null, fields:{}}` on malformed input (never throws). `flow_token` read from the parsed object's `flow_token` key; `fields` = the rest (string-coerced).
  - `newFlowToken(): string` — `'flw_' + <uuid>` (use `crypto.randomUUID()`).

- [ ] **Step 1: Write failing tests** `lib/native-flows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildLeadCaptureFlowJson, NATIVE_FLOW_TEMPLATES, parseNfmReply, newFlowToken } from './native-flows';

describe('buildLeadCaptureFlowJson', () => {
  it('emits a single terminal screen with the expected fields + complete action', () => {
    const j = buildLeadCaptureFlowJson() as any;
    expect(j.version).toBeDefined();
    expect(Array.isArray(j.screens)).toBe(true);
    expect(j.screens).toHaveLength(1);
    const screen = j.screens[0];
    expect(screen.id).toBe('LEAD_CAPTURE');
    expect(screen.terminal).toBe(true);
    const flat = JSON.stringify(screen);
    expect(flat).toContain('full_name');
    expect(flat).toContain('phone');
    expect(flat).toContain('email');
    // Footer action must be "complete" (non-endpoint flow returns data at the end)
    expect(flat).toContain('"name":"complete"');
  });
});

describe('NATIVE_FLOW_TEMPLATES', () => {
  it('has lead_capture with a firstScreen + builder', () => {
    const t = NATIVE_FLOW_TEMPLATES['lead_capture'];
    expect(t).toBeTruthy();
    expect(t!.firstScreen).toBe('LEAD_CAPTURE');
    expect(typeof t!.buildJson).toBe('function');
  });
});

describe('parseNfmReply', () => {
  it('extracts flow_token + fields from a valid response_json', () => {
    const r = parseNfmReply(JSON.stringify({ flow_token: 'flw_x', full_name: 'Asha', email: 'a@b.com' }));
    expect(r.flow_token).toBe('flw_x');
    expect(r.fields.full_name).toBe('Asha');
    expect(r.fields.email).toBe('a@b.com');
    expect(r.fields.flow_token).toBeUndefined();
  });
  it('returns empty result on malformed input, never throws', () => {
    expect(parseNfmReply('not json')).toEqual({ flow_token: null, fields: {} });
    expect(parseNfmReply('')).toEqual({ flow_token: null, fields: {} });
  });
});

describe('newFlowToken', () => {
  it('is prefixed + unique', () => {
    const a = newFlowToken(), b = newFlowToken();
    expect(a.startsWith('flw_')).toBe(true);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run lib/native-flows.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `lib/native-flows.ts`. Build the Flow JSON to Meta's schema (screens → layout `SingleColumnLayout` → children: `TextHeading`, `TextInput` (with `name`, `label`, `input-type`, `required`), `TextArea`, `Footer` with `on-click-action` `{ name:'complete', payload:{ full_name:'${form.full_name}', phone:'${form.phone}', email:'${form.email}', interest:'${form.interest}', flow_token:'${data.flow_token}' } }`). Include `"data": { "flow_token": { "type":"string","__example__":"x" } }` on the screen so the token echoes back in the payload. Version `"5.1"`, `"data_api_version"` OMITTED (non-endpoint). Implement `parseNfmReply` with try/catch, `newFlowToken` via `crypto.randomUUID()`, and `NATIVE_FLOW_TEMPLATES.lead_capture`. Keep the exact function/type names from Interfaces.
- [ ] **Step 4: Run** `npx vitest run lib/native-flows.test.ts` — expect PASS. Then `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(flows): native flow JSON template builder + nfm_reply parser`.

---

### Task 3: Publish route — `POST /api/flows-native/publish`

**Files:**
- Create: `app/api/flows-native/publish/route.ts`
- Create (small helper): add `resolveWabaId(db, workspaceId): Promise<string|null>` inside the route or `lib/native-flows.ts` — reads `workspaces.waba_id` (grep the schema; if the column is absent, read it from `workspaces.settings.waba_id`, and if still absent return null → the route responds 400 "WABA id not configured").

**Interfaces:**
- Consumes: `NATIVE_FLOW_TEMPLATES` (Task 2); `requireWorkspacePermission`/`authzResponse`/`AuthzError` (`lib/authz`); `createAdminClient`.
- Produces: `POST` body `{ workspaceId, templateKey }` → publishes + upserts `flows_meta`, returns `{ ok:true, meta_flow_id, status:'published' }`.

- [ ] **Step 1:** Implement the route. Flow:
  1. `runtime='nodejs'`. Parse `{ workspaceId, templateKey }`; 400 if missing or `templateKey` not in `NATIVE_FLOW_TEMPLATES`.
  2. `await requireWorkspacePermission(workspaceId, 'create_campaigns')` (catch AuthzError→authzResponse).
  3. Admin client. Load workspace `access_token` + resolve `waba_id` (400 if missing). Token BOM-strip.
  4. If a `flows_meta` row exists for `(workspaceId, templateKey)` with `status='published'` + `meta_flow_id`, return it (idempotent).
  5. Graph: `POST /{waba_id}/flows` with `{ name, categories:['LEAD_GENERATION'] }` (form-encoded or JSON per Graph; use JSON body + Bearer token) → `flow_id`. On error return 502 with the Graph error message.
  6. Upload Flow JSON asset: `POST /{flow_id}/assets` multipart with `asset_type=FLOW_JSON`, `file=<template.buildJson()>` as a `flow.json` file (use `FormData` + a `Blob` of `JSON.stringify(json)`; field name `file`, filename `flow.json`, content-type `application/json`; also send `name=flow.json`). Check the response `validation_errors` — if present, return 502 with them.
  7. `POST /{flow_id}/publish`. On error 502.
  8. Upsert `flows_meta` (`workspace_id, template_key, meta_flow_id=flow_id, name, status='published', updated_at=now()`), on conflict `(workspace_id, template_key)` update. Return `{ ok:true, meta_flow_id:flow_id, status:'published' }`.
  - Wrap in try/catch → 500. No secrets in responses (only Graph error text).
- [ ] **Step 2:** `npx tsc --noEmit` clean. (No unit test — Graph API integration; verified live by controller.)
- [ ] **Step 3: Commit** `feat(flows): native flow publish route (Graph API)`.

---

### Task 4: Send route — `POST /api/flows-native/send`

**Files:**
- Create: `app/api/flows-native/send/route.ts`

**Interfaces:**
- Consumes: `NATIVE_FLOW_TEMPLATES`, `newFlowToken` (Task 2); `requireWorkspacePermission`; `assertWorkspaceActive`/`suspendedResponse`/`SuspendedError` (`lib/billing-guard`); `createAdminClient`.
- Produces: `POST` body `{ conversationId, templateKey, header?, body?, footer?, cta? }` → sends the flow message, inserts `flow_sessions_native` + a `messages` row, returns `{ ok:true, messageId }`.

- [ ] **Step 1:** Implement:
  1. `runtime='nodejs'`. Parse body; 400 if `conversationId`/`templateKey` missing or templateKey unknown.
  2. Load conversation (id, workspace_id, contact:contacts(id,phone)) via admin client; 404 if missing. `ctx = await requireWorkspacePermission(conversation.workspace_id, 'handle_conversations')` (AuthzError→authzResponse).
  3. Suspension guard: `try { await assertWorkspaceActive(createAdminClient(), workspace_id) } catch(e){ if(e instanceof SuspendedError) return suspendedResponse(); console.error(...) }`.
  4. Load the published `flows_meta` row for `(workspace_id, templateKey)`; if none/`status!=='published'` return 400 "Form not published — publish it first". Get `meta_flow_id`.
  5. Load workspace `phone_number_id` + `access_token` (BOM-strip). 400 if missing.
  6. `flowToken = newFlowToken()`. Insert `flow_sessions_native` (workspace_id, conversation_id, contact_id, flow_token, template_key, meta_flow_id, status='sent').
  7. Graph send `POST /{phone_number_id}/messages`:

```ts
{
  messaging_product: 'whatsapp', recipient_type: 'individual', to: contact.phone,
  type: 'interactive',
  interactive: {
    type: 'flow',
    ...(header ? { header: { type:'text', text: header } } : {}),
    body: { text: body ?? 'Please fill this quick form 📋' },
    ...(footer ? { footer: { text: footer } } : {}),
    action: { name: 'flow', parameters: {
      flow_message_version: '3', flow_token: flowToken, flow_id: metaFlowId,
      flow_cta: cta ?? 'Open Form', flow_action: 'navigate',
      flow_action_payload: { screen: NATIVE_FLOW_TEMPLATES[templateKey]!.firstScreen },
    } },
  },
}
```
  On Graph error: mark the session row `status='sent'` still (or delete it) + return 502 with the error.
  8. On success insert a `messages` row (workspace_id, conversation_id, sender_id=ctx.userId, sender_type='agent', direction='outbound', type='interactive', content='📋 Sent form: '+templateName, status='sent', whatsapp_msg_id, metadata:{ flow_token, meta_flow_id, template_key }); update `conversations.last_message`/`last_message_at`. Return `{ ok:true, messageId }`.
  - try/catch → 500.
- [ ] **Step 2:** `npx tsc --noEmit` clean.
- [ ] **Step 3: Commit** `feat(flows): native flow send route (interactive flow message)`.

---

### Task 5: `nfm_reply` webhook capture branch

**Files:**
- Modify: `app/api/webhooks/whatsapp/route.ts` (the interactive-message handling — grep `button_reply`/`list_reply` to find where interactive subtypes are dispatched, and the `order` branch added earlier as the pattern for fail-open + short-circuit).

**Interfaces:**
- Consumes: `parseNfmReply` (Task 2); admin client; existing send helper for the optional ack.

- [ ] **Step 1:** Add handling: when an inbound interactive message has subtype `nfm_reply` (`msg.interactive?.type === 'nfm_reply'` or the raw `interactive.nfm_reply.response_json`), route to a new `handleNativeFlowReply(...)` in a **try/catch that logs + swallows**, then **`return`** (do NOT fall through to the AI auto-reply), mirroring the `order` branch. `handleNativeFlowReply`:
  1. `const { flow_token, fields } = parseNfmReply(responseJson)`. If no `flow_token`, log + return.
  2. Look up `flow_sessions_native` by `flow_token` (admin client). If none, log + return (unknown/expired). Derive `workspace_id`, `conversation_id`, `contact_id` from the SESSION row (never from the payload).
  3. Enrich: update the `contacts` row (name from `fields.full_name` if the contact name is empty/phone; email from `fields.email` if present) — workspace-scoped. Upsert/enrich the linked `leads` row (source `'whatsapp_flow'`, attach captured fields into `leads.notes`/tags as the schema allows — grep `leads` columns; keep minimal + additive).
  4. Post a system message into the conversation (`messages` row, `sender_type:'system'` or `internal_note` matching the order-branch style): `"📋 Form submitted — Name: {full_name}, Phone: {phone}, Email: {email}, Interest: {interest}"` (omit blank fields). Update conversation preview.
  5. Mark the session `status='completed', response=fields, completed_at=now()`.
  6. Optional: send a brief WhatsApp ack ("Thanks! We've received your details. 🙏") via the existing send helper.
  - Everything workspace-scoped; fully fail-open.
- [ ] **Step 2:** `npx tsc --noEmit` clean. Confirm (grep) the branch `return`s and is additive-only (no existing path altered).
- [ ] **Step 3: Commit** `feat(flows): capture nfm_reply native-flow submissions`.

---

### Task 6: "WhatsApp Forms" UI — publish + send

**Files:**
- Create: `modules/flows-native/components/WhatsAppForms/index.tsx` (management: list templates + Publish button + published state), and wire it into a settings/flows page (add a route/tab — grep how `app/(dashboard)/flows/page.tsx` or settings tabs are structured; add a "WhatsApp Forms" entry).
- Modify: `modules/conversations/components/MessageInput/index.tsx` — add a "Send form" composer item that lists the workspace's PUBLISHED templates and calls `POST /api/flows-native/send`.

**Interfaces:**
- Consumes: `POST /api/flows-native/publish`, `POST /api/flows-native/send`; a small `GET /api/flows-native` (create it: lists `flows_meta` for the workspace so the UI knows what's published) — permission `create_campaigns`/`handle_conversations`.

- [ ] **Step 1:** Create `GET /api/flows-native/route.ts` → returns `{ forms: flows_meta[] }` for the workspace (auth-gated, workspace-scoped).
- [ ] **Step 2:** Build `WhatsAppForms` management UI: fetch `GET /api/flows-native`, show the Lead Capture template with a **Publish** button (→ publish route, shows "Published ✓" on success), loading/error states, theme tokens. Wire it into the app nav/settings as "WhatsApp Forms" (distinct from "Flows").
- [ ] **Step 3:** In `MessageInput`, add a "Send form" dropdown item: fetch published forms (`GET /api/flows-native`), let the agent pick one, POST to `/api/flows-native/send` with `{ conversationId, templateKey }`, toast success/error (surface the 502 Graph error), refresh the thread.
- [ ] **Step 4:** `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(flows): WhatsApp Forms publish + send UI`.

---

## Post-implementation (controller)
1. Apply migration 071 live; verify tables.
2. Whole-branch review (opus): webhook branch fail-open + additive; publish/send auth + workspace-scoped; `flow_token` reverse-lookup cross-tenant-safe; no secrets leaked; template JSON valid.
3. **Live E2E (user prerequisite: a WABA with Flows enabled):** publish Lead Capture on a test workspace → send to a test number → fill + submit the native form → confirm `nfm_reply` enriches the contact/lead + posts the thread summary + completes the session.
4. Merge → push → user redeploys.

## Self-Review
- **Spec coverage:** migration (T1), template builder + parser (T2), publish (T3), send (T4), nfm_reply capture (T5), UI (T6) — all spec sections mapped. Phase-2 crypto/data-exchange correctly excluded.
- **Placeholders:** none — SQL, template shape, Graph payloads, and route flows are concrete; where a column's presence is uncertain (`workspaces.waba_id`, `leads` capture columns) the task says grep + gives the fallback (settings.waba_id; minimal additive enrich).
- **Type consistency:** `buildLeadCaptureFlowJson`/`NATIVE_FLOW_TEMPLATES`/`parseNfmReply`/`newFlowToken` names used identically across T2→T3→T4→T5; `flow_token`/`meta_flow_id`/`template_key` column names consistent across T1 tables and all routes.
