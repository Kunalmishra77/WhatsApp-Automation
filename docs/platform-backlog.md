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

- [ ] **Rotate the production database password.** The working tree no longer
  holds it — it moved to `SUPABASE_DB_URL` via `database/connection.mjs`, and a
  third copy came out of a stale `psql` allow-rule in `.claude/settings.json`,
  which was git-tracked. **But it is still in the git history of a GitHub repo**,
  which editing files cannot undo. Rotating in Supabase is the only fix; the new
  password goes in `.env.local` (gitignored) and in Coolify's env, nowhere else.
- [ ] **Regenerate the Google Places API key.** It was pasted into a chat.
  Regenerate, and restrict the new key to the Places API and the server's IP.
- [ ] **Rotate the OpenAI key.** Also pasted into a chat.

## P1 — Leads being lost, today

- [x] 2026-10-30 — **Creating a template now sends it to Meta.** It used to save
  locally and stop, with a toast asking the client to submit it — and the submit
  button is a small icon in the list that nobody pressed. So templates sat at
  'pending' forever and clients went to Meta's own dashboard instead, which is
  the complaint "platform se template approve nahi hota". V4you's
  `gym_plateform` sat untouched for two days. Two supporting fixes: the submit
  route was reading Meta's template id and dropping it into the activity log
  instead of the column (so `meta_template_id` was null on every row, approved
  ones included), and nothing brought approval decisions back on a schedule —
  migration 132 schedules `sync-template-status`.
- [x] 2026-10-30 — **Scheduled `time-triggers`, which nothing was running.**
  A gap in work already shipped: the flow Wait node and every question timeout
  queue into `time_trigger_queue`, and no cron processed it, so a flow reaching
  a Wait node would have parked forever. Migration 132.

- [x] 2026-10-28 — **The campaign wizard's review step now says what the bot will
  quote.** `offerReadinessForCampaign` covers all five states that have actually
  occurred: no offer, ended, not started, running with no end date, running
  properly. A warning has to be ticked before the campaign can be sent, so
  nobody skips it without choosing to.
- [x] 2026-10-28 — **An offer now requires an end date**, server-side in
  `validateOfferInput` and in the card's save button. Without one it never
  retires and stays the bot's only quotable price — Thames's "Monsoon Offer"
  into late October.
- [ ] **Surface the offer's state on the dashboard.** The wizard catches it at
  send time, but a lapsed offer is still invisible until someone opens Knowledge
  Base. A client should see "your offer ended 3 days ago" without looking for it.
- [ ] **Remind before an offer lapses.** The `offer-lapse-check` cron (migration
  059) emails admins on lapse. It should warn the client a few days ahead, and it
  should be visible in the app, not only in email.

## P2 — Correctness of what the dashboard shows

- [x] 2026-10-28 — **`total` no longer counts conversation-and-lead pairs.**
  `conversation_summary` returns it (migration 128), carrying the rules the
  summary does not: it follows the open tab and shows spam only on the Spam tab.
  The page query's exact count stays as the fallback for the window before the
  migration is applied; **dropping that count is the next saving to take**, once
  the function is proven in production — it is a second full scan per load.
- [x] 2026-10-28 — **One lead per contact, enforced.** The duplicates were a
  race, not a design: three paths each did "does a lead exist?" then inserted,
  with nothing guarding the gap, so concurrent events for one contact all passed
  the check. 219 of the 222 groups were created inside ten seconds and none more
  than an hour apart, so nobody ever wanted two. Migration 129 merges and adds a
  unique index; `lib/lead-upsert.ts` makes all three paths race-safe and the CRM
  path explain itself instead of showing a constraint name.

## P3 — Scalability, in measured order

- [ ] **The app container leaks zombie processes.** 294 of them on 2026-10-30,
  all parented to the `next-server` process inside the AGENTiX container
  (`w80g8co4gwcgccccw080c4ss`), accumulated over about 40 hours — roughly seven
  an hour. Not urgent: the process table takes weeks to fill and every deploy
  resets it. But nothing in this codebase calls `child_process`, and the only
  spawn-prone dependency is `@playwright/test`, which is a devDependency. So
  something spawns and never reaps, and what it is cannot be worked out without
  the zombies' own command names:
  `ps -eo stat,ppid,comm | awk '$1 ~ /Z/ {print $3}' | sort | uniq -c | sort -rn`
  run on the server after they have accumulated again.

Baseline and the queries that produced it: `memory/scalability-measured-baseline.md`.
`pg_stat_statements` is enabled — start there, not in the code.

- [x] 2026-10-30 — **A late receipt no longer downgrades a read message, and
  stops rewriting rows for nothing.** Both tables applied receipts without
  checking they were an advance: `messages` had no guard at all, and
  `campaign_recipients` guarded only 'replied' and 'filtered', leaving 'read'
  exposed. Meta reorders receipts, so a `delivered` arriving after `read` pulled
  the row back — and a campaign's read_count counts status in ('read','replied'),
  so each one dropped a read out of the client's report. **This is a real cause
  of the platform's read rates sitting below Meta's own**, which had been filed
  as structural in `memory/campaign-stats-vs-meta-mismatch.md`.
  Repaired by migration 130, which the timestamps made possible: 746 reads and
  1,579 delivered restored across 96 campaigns, 63 campaigns' read_count
  corrected, plus 686 message rows. The guard is `lib/message-status.ts`.
  Separately it stops the `sent` receipt rewriting rows that are already 'sent',
  which is every outbound message — each of those no-op updates copied the whole
  old row, `content` and `meta` included, into the WAL.
- [ ] **Realtime WAL decoding — 2.2M calls, 3.7 hours of database time, still
  the largest single consumer.** Investigated 2026-10-28; `REPLICA IDENTITY
  USING INDEX` is **not available for `conversations`**, which is the awkward
  part. Its policy is `can_view_assigned_row(workspace_id, assigned_agent_id)`
  and a replica identity index must be unique over NOT NULL columns —
  `assigned_agent_id` is null on every unassigned conversation. So FULL has to
  stay there. `messages` (policy needs `workspace_id` + `conversation_id`) and
  `notifications` (needs `user_id`) are both candidates, and `messages` is where
  the volume is. Remaining levers, in order of safety: fewer writes (one shipped
  above, more available — the `conversations` row is rewritten on every single
  message by the `messages_update_conversation` trigger), then USING INDEX on
  `messages` alone. **Whoever does the index change must have someone watching
  the Conversations page update live afterwards** — getting it wrong silently
  stops the inbox refreshing, which is the exact bug migration 047 fixed.
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

- [x] 2026-10-30 — **Simulator.** "Try it" in the flow editor opens a transcript
  you type into; nothing reaches WhatsApp. It runs the real handlers and the
  real edge resolution — `findNextNode` moved to `lib/flow-nodes/walk.ts` so the
  engine and the simulator share one copy, because a simulator that resolved
  edges differently would be confidently wrong, which is worse than none. The
  tests run the broken Fitness First flow through it and assert all five
  messages land in one turn. What it cannot do is stated in the panel: no AI
  call, so every reply counts as an answer, and a wait is shown and skipped.
- [x] 2026-10-30 — **Guided step-list view.** Measured against the live flows
  rather than guessed: eleven of the eighteen are straight lines and open as a
  list, and eight of those are two to four nodes — a single auto-reply someone
  built on a node canvas. Same stored flow, same node ids, canvas one click
  away, and the view is chosen automatically until the author picks one.
  `lib/flow-steps.ts` refuses to flatten anything it cannot show — a branch, a
  loop, a question with choices, or a node left off the chain — because saving
  from a list that had dropped one would delete it.
- [x] 2026-10-30 — **Extended validation.** Seven checks where there were two:
  unreachable nodes, dead ends, empty copy, media with no file, a misspelt
  `{{system.*}}` built-in, a variable read before any route has saved it, and a
  wait longer than 24 hours followed by a message that WhatsApp would not
  deliver. An empty `end` or handoff is deliberately not flagged — stopping
  quietly is a real choice, and false warnings teach people to ignore all of
  them.
- [ ] **Two remaining validation checks need the database**, so they do not
  belong in the pure validator: two active flows sharing a trigger, and a
  referenced template that no longer exists. Both want a check at save time in
  the API route.
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
