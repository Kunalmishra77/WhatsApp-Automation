# Platform Backlog

Everything known to be outstanding, in the order it should be done. One list, so
nothing is carried in someone's head.

Started 2026-10-28. Tick items here as they ship; add the commit next to them.
An item leaves this file only when it is done or explicitly dropped — not when it
becomes inconvenient.

Priority is **cost of leaving it undone**, not effort. Security exposure and lost
leads outrank features.

---

## P0 — Credentials that are already exposed

These are not features. Every one of them is live right now and a person with the
repo, or with a scroll of an old chat, can use them.

- [ ] **Rotate the production database password.** It is committed in
  `database/run-migration.mjs` and `database/query.mjs`, so it is in the git
  history of a GitHub repo and cannot be removed by editing the file. Rotate in
  Supabase, move the string to an env var, and keep both scripts working off
  `process.env`.
- [ ] **Regenerate the Google Places API key.** It was pasted into a chat.
  Regenerate, and restrict the new key to the Places API and the server's IP.
- [ ] **Rotate the OpenAI key.** Also pasted into a chat.

## P1 — Leads being lost, today

- [ ] **Make the Current Offer impossible to skip when a campaign goes out.**
  This is the root of the 2026-10-28 incident and it will recur on the next
  campaign. Of twelve workspaces, two had ever set an offer and both were stale.
  The campaign wizard should ask for the offer, and refuse — or loudly warn — to
  send a promotional campaign while `settings.active_offer` is missing or outside
  its window. Also surface the offer's state on the dashboard so a lapsed one is
  visible without opening Knowledge Base. See
  `memory/kb-pricing-conflict-three-sources.md`.
- [ ] **Warn on an offer with no end date.** Thames ran a "Monsoon Offer" with no
  `valid_until` into late October and it stayed the bot's only pricing authority.
  The save path should require an end date, or at least warn hard.

## P2 — Correctness of what the dashboard shows

- [ ] **`total` is inflated while temperature or stage is filtered.** The page
  query's `count: 'exact'` counts conversation-and-lead pairs. The summary counts
  were fixed in migration 127; this one is still wrong, and the comment in
  `app/api/conversations/search/route.ts` says so. Either extend
  `conversation_summary` with the flag and spam rules so it can return `total`
  too, or add a small companion function.
- [ ] **222 conversations carry more than one lead** — 453 lead rows between
  them, one conversation with five. Find out how they are created before deciding
  whether to merge, because the fix depends on the cause. This is what made the
  temperature counts wrong, and it probably skews other per-lead reporting.

## P3 — Scalability, in measured order

Baseline and the queries that produced it: `memory/scalability-measured-baseline.md`.
`pg_stat_statements` is enabled — start there, not in the code.

- [ ] **Realtime WAL decoding — 2.2M calls, 3.7 hours of database time, ten
  times the next item.** `conversations`, `messages` and `notifications` are all
  `REPLICA IDENTITY FULL`, so every UPDATE writes the whole old row into WAL, and
  `messages` rows carry `content` and `meta`. FULL is deliberate (migration 047):
  Realtime re-checks RLS against WAL data and needs `workspace_id`, which is not
  in the primary key. The fix that keeps both: a unique index on
  `(workspace_id, id)` and `REPLICA IDENTITY USING INDEX`. **Verify the
  Conversations page still updates live afterwards** — getting this wrong
  silently stops the inbox refreshing, which is the exact bug 047 fixed.
- [ ] **~40 sequential awaited DB calls per inbound message** in the WhatsApp
  webhook (123 `.from(` calls, two `Promise.all`). The latency and
  connection-pool risk, and the largest remaining job. Batch what is independent;
  cache what is per-workspace.
- [ ] **In-memory `Map` caches block horizontal scaling.** `lib/ai-reply.ts`,
  `lib/campaign-executor.ts` and others cache per-container, so a second app
  instance would serve stale personas and double-send. Move to Redis — the client
  and the pattern already exist in `lib/workspace-cache.ts`.
- [ ] **Partition `messages` and `campaign_recipients` by month.** Not needed
  yet; needed around 100 clients. `campaign_recipients` is already 404k rows and
  149 MB.
- [ ] **Read replica for analytics and dashboards.** Around 300 clients, after
  the Map caches are gone.

## P4 — Flow builder Phase 2: a client can build one alone

Design: `docs/superpowers/specs/2026-10-28-flow-builder-v2-design.md`.
Phase 1 shipped in c90b0c8.

- [ ] **Simulator.** Type a customer's replies, watch the flow run, see each node
  highlight and each variable fill, nothing sent to WhatsApp. Today the only way
  to test a flow is to message a client's live number, and the only way to find a
  mistake is a customer hitting it. The Fitness First flow that fired six
  messages at once would not have survived one run.
- [ ] **Guided step-list view.** Eight of eighteen live flows are two to four
  nodes: one auto-reply. Those clients opened a node canvas to write a single
  message. Same stored flow, a vertical list of steps, canvas one click away.
- [ ] **Extended validation.** `lib/flow-validate.ts` warns on a condition with
  no question above it and on a `{{variable}}` nothing saves. Add: unreachable
  nodes, dead ends, empty messages, more outgoing edges than the node has
  handles, two active flows sharing a trigger, a missing template, a variable
  read before it is written, and a wait that would push a message outside the
  24-hour window without a template.
- [ ] **Plain-language flow summary**, derived from the nodes so it cannot drift.
  The fastest way for a client to see a flow is wrong.
- [ ] **Vertical template packs** with real Hindi and English copy: gym, clinic,
  salon, resort, D2C, real estate, coaching, software demo. The five existing
  presets are generic.
- [ ] **Repair the AI flow builder.** `/api/flows/generate` knows only the six
  original node types and returns a 502 that was never reproduced; diagnostics
  were shipped but the cause is still unknown. Rewrite against the new palette
  and run its output through the validator before showing it.

## P5 — Flow builder Phase 3: power

- [ ] **Template node** — send an approved WhatsApp template. The only way to
  reopen a conversation after 24 hours, so wait-then-follow-up is incomplete
  without it.
- [ ] **AI Reply node** — hand one turn to the persona and knowledge base, then
  return to the flow.
- [ ] **Webhook node** — POST the context out, read JSON back into variables.
  The deliberate escape hatch, and how per-workspace Sheets stops being special.
- [ ] **Switch** (many-way branch), **Collect** (validated input with re-ask and
  a give-up branch), **Jump** (reuse a sub-flow), **Split** (A/B).
- [ ] **Richer triggers**: button or list reply id, template button click, ad
  click by ad id, lead created / tag added / temperature changed, conversation
  idle N hours, a schedule, campaign reply, manual/API, any-message fallback.
  Plus **active windows** so an after-hours flow and a working-hours flow can
  share a trigger.
- [ ] **Per-node drop-off analytics** — where customers leave a flow.
- [ ] **Version history and rollback.** Non-technical people edit live flows.

## P6 — Platform audit leftovers

From the 18-point program (2026-09-30). Migration 100 is applied.

- [ ] #4 Team "Assigned Work" view, from the existing `tasks` data
- [ ] #9 "AI Revenue Intelligence" shows lead scoring, not money — rename to AI
  Lead Intelligence, or add real order-attributed revenue
- [ ] #10 dashboard polish (CommandCenter already has charts)
- [ ] #6 billing and Meta-spend real-data states
- [ ] #7 bookings/events workflow
- [ ] #11 profile, #16 login, #15 landing design
- [ ] #12 UI/UX pass, #13 mobile
- [ ] #14 integrations architecture (Settings → Integrations)
- [ ] #17 features research

## P7 — Blocked on someone else

Not startable by us. Each needs a credential, an approval or a purchase.

- [ ] **Razorpay ₹1 live test** — no payment attempted since 7 September
- [ ] **GBP API quota** — case `6-1514000042067`; on approval set
  `GBP_API_ACCESS_GRANTED = true`
- [ ] **Google OAuth verification** — with Google since 24 October
- [ ] **Native WhatsApp Flows publish** — blocked on each client's WABA being
  Business-Verified (Meta error 139000)
- [ ] **Lead backlog re-score** — deferred until the OpenAI account is topped up;
  run hot and warm first (~$8). New leads already classify correctly.
- [ ] **In-chat payments** — needs each client's own Razorpay keys
- [ ] **Auto lead-routing follow-up** — needs an approved out-of-window template
- [ ] **Google Ads offline conversion upload** — needs Ads write access and a
  configured conversion action
- [ ] **Telegram / SMS / Email / website live-chat** — needs provider accounts
- [ ] **Native mobile app** (React Native) — separate project; the PWA ships today
- [ ] **Per-client branded PDF report** — the monthly email digest exists; the
  PDF does not

---

## Done

- [x] 2026-10-28 — Flow editor warns about a condition with no question above it
  and a `{{variable}}` nothing saves (`d8c79bb`)
- [x] 2026-10-28 — Flow node handler registry; wait, media, action nodes; button
  and menu answers with a branch each; real per-node timeouts; ordered trigger
  matching; `system.` variables; `pagarbook` and VMS's sheet columns out of
  shared code (`c90b0c8`)
- [x] 2026-10-28 — An ended offer withdraws itself instead of silencing the bot's
  pricing entirely; Fitness First's Diwali offer set, Thames and VMS retired
  (`fb728df`, migration 124)
- [x] 2026-10-28 — Reply-loop limit 40 → 150 after it silenced a real lead on a
  campaign day; false positives cleared (`c90b0c8`, `23c8a71`, migrations 123/125)
- [x] 2026-10-28 — Eight hot foreign keys indexed (`cb0e401`, migration 126)
- [x] 2026-10-28 — Conversations page nine queries → two; temperature counts stop
  counting conversation-and-lead pairs (`dbc7467`, `8bb39a5`, migration 127)
