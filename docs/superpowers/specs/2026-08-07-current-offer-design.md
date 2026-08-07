# Current Offer — Single Authoritative Pricing the Bot Always Quotes

**Date:** 2026-08-07
**Status:** Approved design, pending implementation plan

## Problem

When a client runs an offer, the bot frequently quotes the **wrong price**. Offers today
live implicitly in two places that both go stale:

1. The **persona** (`workspaces.settings.agent_persona`) — a long system prompt that often
   hardcodes prices, injected into every reply.
2. Uploaded **knowledge base** docs (`knowledge_base` rows + `vector_documents` chunks) —
   retrieved by similarity, where an old 100+ chunk doc can drown out a new 2-chunk offer doc.

Nothing makes a new offer **supersede** the old one. The result (observed live for the
"Fitness First Dwarka" workspace, Aug 2026): the same Monsoon Offer was quoted to different
users at ₹75,000, ₹55,950, and ₹27,450 because three sources disagreed. The manual fix was to
rewrite the persona, delete the stale KB chunks, and message affected users — unsustainable
per-client firefighting.

## Goal

A first-class **Current Offer** per workspace: one authoritative place a client sets what the
bot should say about price/offers right now. The bot quotes **only** that, never stale prices,
and defers to the team when no offer is active. Self-serve, self-expiring, conflict-aware.

## Non-goals (YAGNI)

- Offer history / audit trail.
- Multiple concurrent offers per workspace (future: dedicated `offers` table — see Alternatives).
- Per-language offer text (the bot already translates replies into the user's language).
- Coupling to the Campaign broadcast feature (stays separate; a future nicety could pre-fill a
  campaign from the offer).
- A/B or scheduled sequences beyond a single valid-from / valid-until window.

## Decisions (from brainstorming)

1. **Entry:** a dedicated "Current Offer" box (not KB-upload auto-clean, not campaign-coupled).
2. **Conflict handling:** offer wins at reply time **and** warn the client about conflicting
   prices still in KB/persona.
3. **Model:** one "Current Offer / Pricing" box = the single source of truth for pricing right
   now (not a promo layered over a separate standing price list).
4. **Expiry:** when the offer lapses or none is set, the bot **never quotes stale** — it defers
   to the team and captures the lead; the client is reminded the offer lapsed.

## Architecture — Approach A (chosen): offer stored in workspace settings

The offer is a structured object in `workspaces.settings.active_offer`. It rides along with the
already-cached workspace row (the 60s Redis workspace cache), so the reply path needs **zero
extra query**.

### Data model

```json
{
  "active_offer": {
    "name": "Monsoon Offer",
    "details": "Buy a 1-Year Membership for ₹75,000 and get 1 Year FREE (2 years total). No membership below ₹75,000. No hidden charges.",
    "valid_from": "2026-08-04",     // optional (YYYY-MM-DD); empty = active now
    "valid_until": "2026-08-31",    // optional (YYYY-MM-DD); empty = evergreen
    "updated_at": "2026-08-07T09:00:00Z"
  }
}
```

- One object = the single current offer. Saving overwrites; clearing removes the key.
- No migration required for the hot path (settings is existing JSONB).

### Offer status (computed at reply time, IST-aware)

Reuse the existing IST clock used for `nowIST` in `lib/ai-reply.ts`. Compare **dates** (not
timestamps) in IST:

- **none** — no `active_offer` object at all. **Behaves exactly as today** (bot uses KB/persona
  for pricing). This is the backward-compatible default: workspaces that never adopt the feature
  are unaffected. No OFFER or GUARD block is injected.
- **active** — object exists, `valid_from` empty or ≤ today, `valid_until` empty or ≥ today →
  OFFER block.
- **expired** — object exists and `valid_until` is before today → GUARD block, and flagged for
  the lapse reminder.
- **scheduled** — object exists and `valid_from` is in the future → GUARD block (during a planned
  transition the bot defers rather than quoting the outgoing price).

**Key rule:** the GUARD block fires only when an `active_offer` object exists but is not currently
valid (expired/scheduled). "No offer object" is NOT a guard — it keeps today's behavior. This is
what makes the feature opt-in and non-breaking.

### Reply behavior (`lib/ai-reply.ts`)

`getAIReply` already receives the workspace/settings; the missed-reply-sweep path
(`lib/reply-sweep.ts`) uses the same helpers. Extract `active_offer`, compute status, and build
one of two blocks placed **above** the existing KB block:

- **active** — OFFER block:
  ```
  🔴 CURRENT OFFER — HIGHEST PRIORITY, OVERRIDES EVERYTHING BELOW.
  This is the ONLY price/offer you may quote. If the customer asks about price, plans, or
  offers, use EXACTLY this and nothing else. NEVER quote any other price, plan, discount, or
  EMI that appears anywhere else in this prompt or the knowledge base — those are outdated.
  Offer: {name}
  {details}
  {valid_until ? "Valid until {valid_until}." : ""}
  ```
- **expired / scheduled** — GUARD block:
  ```
  PRICING RULE: There is no active offer right now. If the customer asks about price, plans, or
  offers, do NOT quote any number from the knowledge base or persona. Warmly say a team member
  will share the latest pricing shortly, and capture their interest / ask for the best number to
  reach them.
  ```
- **none** (no offer object) — inject neither block; the reply path is unchanged from today.

**Precedence tweak:** the current prompt tells the model "KNOWLEDGE BASE … PRIMARY SOURCE OF
TRUTH." Scope that to *facts*, and add one line making the OFFER/GUARD block the **sole authority
for pricing**: "For price/plans/offers, the CURRENT OFFER block above is the only authority;
KB pricing is superseded." Non-pricing questions (location, hours, trial, facilities) continue to
use the KB unchanged.

## UI — "Current Offer" card

Location: the workspace's AI/agent settings area, near knowledge-base management.

- Fields: **Name** (short text), **Details** (textarea, ≤ 1500 chars), **Valid from** (optional
  date), **Valid until** (optional date). A status pill: **Active / Scheduled / Expired / None**.
  **Save** and **Clear** buttons.
- After save, show inline **conflict warnings** returned by the API:
  "⚠️ Your knowledge base still mentions ₹27,450, ₹37,450 — these may confuse the bot. Review KB →"
- One-line preview: "This is the only pricing the bot will quote to customers."

## API + conflict scan

- `PUT /api/offer` — auth `manage_workspace`; validate (`name` + `details` required; dates
  well-formed; `valid_until` ≥ `valid_from` if both set); write `settings.active_offer` via
  `jsonb_set`; **invalidate the workspace cache** (`agentix:ws:id:<id>` and
  `agentix:ws:pnid:<pnid>`) so the new offer is live immediately; run the conflict scan; return
  `{ ok: true, warnings: string[] }`.
- `DELETE /api/offer` — remove `settings.active_offer`; invalidate cache.
- **Conflict-scan helper** (pure, unit-testable): given the offer details and the workspace's
  `knowledge_base.content` + `vector_documents.content` + persona text, extract money amounts
  (regex covering `₹`, `Rs`, `INR` followed by grouped digits, e.g. `₹75,000` / `Rs 27,450` /
  `INR 55950`), normalize (strip separators), and return the **distinct amounts present in
  KB/persona but absent from the offer details**. Bounded (cap rows scanned/returned, dedupe).
  No amount → no warning.

## Lapse reminder

A **daily pure-SQL `pg_cron` job** (no HTTP call → sidesteps the unset `app.base_url` /
`app.cron_secret` issue): find workspaces where `settings.active_offer.valid_until` is a valid
date before `CURRENT_DATE` and not yet flagged, insert one **notification** using the existing
notifications table ("Your '{name}' offer expired on {date} — set a new offer or the bot will
defer pricing to your team."), and set a one-time flag (e.g. `active_offer.lapse_notified = true`)
so it fires once. Clearing/replacing the offer resets the flag.

## Edge cases

- Evergreen offer (`valid_until` empty) → always active until changed/cleared; never triggers the
  lapse reminder.
- `valid_from` in the future → **scheduled**; bot defers (does not quote) until the date arrives.
- Details length capped to keep the prompt lean.
- Offer text authored in one language; the bot's existing language rule translates it into the
  customer's language.
- Cache: a direct DB write to settings (outside this API) still refreshes within the 60s TTL; the
  API path invalidates immediately.

## Testing

- **Unit:** offer-status computation across none/scheduled/active/expired with/without each date,
  in IST. Conflict-scan extraction: finds stale KB/persona amounts, ignores the offer's own,
  handles `₹`/`Rs`/`INR`, dedupes.
- **Generation test** (scripted, like the Fitness First verification): active offer + a KB chunk
  quoting a *different* price → generated reply quotes the offer price and none of the stale
  figures.
- **Expiry test:** expired/scheduled → reply defers to team, contains no KB/persona price number.
- **Backward-compat test:** no `active_offer` object → reply path unchanged (KB pricing still used;
  no GUARD injected).
- **API:** auth required; validation rejects bad dates; returns warnings for a workspace whose KB
  contains a non-offer amount; cache invalidation invoked.

## Alternatives considered

- **Approach B — dedicated `offers` table:** cleaner data model, history, and room for multiple
  or scheduled offers, at the cost of a new table plus extending the workspace cache to carry the
  active offer. Rejected for the MVP as more surface area than the single-offer need requires;
  it remains the natural upgrade path.
- **Tie offer to the Campaign feature:** one action drives broadcast + replies. Rejected in
  brainstorming — clients wanted a standalone pricing source, and campaigns are broadcast-shaped,
  not a standing source of truth.

## Rollout

- No breaking change: workspaces with no `active_offer` object behave **exactly as today** for
  both pricing and non-pricing (the feature is opt-in). Only workspaces that set an offer get the
  OFFER block (when active) or the GUARD block (when their own offer has expired/is scheduled).
- Ships as normal code (persona/KB fix for a specific client was data-only; this is code) →
  requires a redeploy once merged.
