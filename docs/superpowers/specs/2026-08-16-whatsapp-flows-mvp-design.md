# Native Meta WhatsApp Flows — MVP Design (non-endpoint)

**Date:** 2026-08-16
**Status:** Approved (design direction), pending spec review → writing-plans
**Part of:** Project 4 Wave 4e (competitive features), item 4e-3

## Problem

Competitors offer Meta's **native in-chat WhatsApp Flows** — a multi-screen native form UI rendered
inside WhatsApp for structured data capture (lead qualification, appointment booking, feedback). Our
codebase has a *homegrown* keyword-triggered chatbot builder mislabeled "Flows", but **zero** native
Meta Flows integration (no `flow_json`, no `flow` message type, no `nfm_reply` handling). This adds the
real thing.

## Key architectural decision: non-endpoint flows (no crypto in the MVP)

Meta Flows come in two forms:

- **Endpoint flows** (server-driven): screens fetch/validate data from our server mid-flow via an
  **RSA/AES-encrypted `data_exchange` webhook**, requiring a business **public-key registration** per
  WABA. This is the crypto-heavy, multi-week, silently-fails-if-wrong piece.
- **Non-endpoint flows** (self-contained): *all* screens live in the Flow JSON, the form runs entirely
  on the customer's device, and the collected data returns **once at completion as an `nfm_reply`**
  interactive message on the normal inbound webhook. **No encryption, no key registration, no
  data-exchange endpoint.**

The MVP use case — native forms that capture structured lead data — is fully served by **non-endpoint
flows**. So the MVP is **M-effort**, and the client's Meta dependency shrinks to publishing the Flow
(no key ceremony). **The encrypted data-exchange endpoint + per-workspace RSA keypair + public-key
registration are deferred to Phase 2**, built only when a client needs dynamic/server-driven flows.

## MVP scope

**In:** publish a predefined non-endpoint Flow per workspace, send it into a conversation, capture the
`nfm_reply` submission onto the contact/lead + into the thread.
**Out (Phase 2):** encrypted data-exchange endpoint, RSA keypair + public-key registration, a visual
screen builder, dynamic/conditional screens, multiple arbitrary custom flows per workspace.

## Architecture

### 1. Flow JSON templates
Start with **one** template: **"Lead Capture"** — a single-screen form (Flow JSON v"5.x") with fields:
full name (TextInput), phone (TextInput, prefilled from the contact where possible), email
(TextInput, optional), interest/message (TextArea or Dropdown), and a Submit footer whose action is
`complete` (returns the field values as the flow response payload). Templates live in code
(`lib/flow-templates/` — a typed builder returning valid Flow JSON), NOT user-authored in the MVP.
*(A second template — "Appointment Booking" with a DatePicker — is a fast-follow, not MVP.)*

### 2. Publish (Graph API)
- New `flows_meta` table: `id, workspace_id, template_key, meta_flow_id, name, status
  (draft|published|deprecated), created_at, updated_at` (unique on `(workspace_id, template_key)`).
- `POST /api/flows-native/publish` (platform-scoped to the workspace, permission `create_campaigns`):
  1. `POST https://graph.facebook.com/v19.0/{waba_id}/flows` (name, categories) using the workspace's
     access token → `meta_flow_id`. (Resolve the workspace's `waba_id`; if not stored, derive/store it.)
  2. Upload the template's Flow JSON asset (`POST /{meta_flow_id}/assets`, `asset_type=FLOW_JSON`).
  3. `POST /{meta_flow_id}/publish`.
  4. Upsert `flows_meta` with `meta_flow_id` + status. Surface Graph errors clearly (Flows must have a
     valid WABA + the account eligible; report, don't crash).
- Idempotent: re-publishing reuses the existing `meta_flow_id` row.

### 3. Send (interactive `flow` message)
- `POST /api/flows-native/send` (permission `handle_conversations`, suspension-guarded like other
  sends): body `{ conversationId, templateKey }`. Resolves the published `meta_flow_id`, generates a
  `flow_token` = opaque id encoding `{ workspaceId, conversationId, contactId, templateKey }` (store a
  `flow_sessions_native` row keyed by token, or encode+sign — MVP: store a row for reliable lookup on
  reply), and sends the interactive `flow` message via Graph API:
  `type:'interactive', interactive:{ type:'flow', header/body/footer, action:{ name:'flow',
  parameters:{ flow_message_version:'3', flow_token, flow_id: meta_flow_id, flow_cta:'Open Form',
  flow_action:'navigate', flow_action_payload:{ screen:'<first screen id>' } } } }`.
- Log the outbound to `messages` (type interactive, metadata records flow_token/flow_id) so it shows in
  the thread. UI: a "Send form" item in the conversation composer (`MessageInput`) listing the
  workspace's published templates.

### 4. Receive (`nfm_reply` → capture)
- Add a branch in `app/api/webhooks/whatsapp/route.ts` for the interactive subtype **`nfm_reply`**
  (the native-flow completion). Parse `interactive.nfm_reply.response_json` (JSON string of the
  submitted fields + the `flow_token`). Look up the `flow_token` → workspace/conversation/contact.
  Then: (a) update the contact (name/email/phone if provided) and upsert/enrich the linked lead
  (source `'whatsapp_flow'`); (b) post a system message into the thread ("📋 Form submitted: Name: …,
  Email: …, Interest: …"); (c) mark the `flow_sessions_native` row completed. **Fail-open + short-circuit**
  exactly like the order-capture branch (try/catch, `return`, never break the reply pipeline, never
  double-reply). Optionally send a brief WhatsApp acknowledgment.

### 5. Management UI
Minimal: a section (under the existing Flows page or Settings) listing the available templates with a
**Publish** / **Published ✓** state per workspace, so a client one-click-publishes the Lead Capture
form before sending it. No screen editing in the MVP.

## Data flow

Publish (client) → Graph API → `flows_meta`.
Send (agent) → `flows_native/send` → Graph `flow` message → customer's WhatsApp → `flow_sessions_native`.
Customer fills form on-device → submits → Meta delivers `nfm_reply` → webhook branch → contact/lead
enriched + thread summary + session completed.

## Error handling
- Publish: surface Graph errors (ineligible WABA, missing `waba_id`) as actionable messages; no crash.
- Send: 400 if the template isn't published for the workspace; suspension-guarded; Graph errors → 502.
- Receive: fully fail-open (a malformed `nfm_reply`/unknown `flow_token` logs + is ignored, never breaks
  ingestion or the AI reply pipeline).
- All routes workspace-scoped; the webhook branch derives workspace from the verified inbound sender +
  the stored `flow_token`, never from client-controlled fields.

## Testing
- **Unit:** Flow JSON template builder emits valid schema (screen/component shape, `complete` action);
  `flow_token` encode/lookup round-trips; `nfm_reply` `response_json` parser handles the documented
  shape + malformed input.
- **Live (controller):** publish the Lead Capture flow on a real test workspace/WABA, send it to a test
  number, submit the form, confirm the `nfm_reply` captures onto the contact/lead + thread. (Requires a
  WABA with Flows enabled — a user prerequisite.)
- **Security:** send/publish auth-gated + workspace-scoped; webhook branch fail-open + short-circuits;
  cross-tenant safety on the `flow_token` lookup.

## Rollout
Additive: new tables + routes + one webhook branch + a UI section. Migration for `flows_meta` +
`flow_sessions_native`. Client prerequisite: WABA with Flows enabled; they click Publish once per
template. No change to existing (homegrown) "Flows" builder — the native feature is separate (name the
UI section "WhatsApp Forms" to avoid confusion with the existing "Flows").

## Out of scope / Phase 2
Encrypted data-exchange endpoint + per-workspace RSA keypair + WABA public-key registration (for
server-driven/dynamic flows); visual Flow-JSON screen builder; conditional multi-screen logic;
analytics on form completion rates.

## Self-review notes
- Single template (Lead Capture) keeps the MVP focused; second template is an explicit fast-follow.
- "WhatsApp Forms" naming avoids collision with the existing homegrown "Flows".
- `flow_token` stored in a session row (not just signed-encoded) for reliable reverse-lookup on reply.
- No crypto anywhere in the MVP — deferred until dynamic flows are actually needed.
