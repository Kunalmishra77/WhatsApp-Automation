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
- [x] 2026-10-30 — **The offer's state is on the dashboard.** A slim card at the
  top of the Command Center says what the bot will quote today, from the same
  `offerAlert` the campaign wizard uses, so the two cannot drift. Deliberately
  quiet where there is nothing to fix: having no offer is not a warning — ten of
  twelve workspaces run that way correctly — and a comfortably running offer
  gets a green line, not an alarm. The state is computed server-side in
  `GET /api/offer`, because the only date that matters is today in IST and a
  browser in another zone would reach a different verdict than the bot.
- [x] 2026-10-30 — **The client is warned three days before an offer lapses.**
  Migration 134 extends `offer-lapse-check` (059) with a second branch guarded
  by its own `lapse_warned` flag; saving an offer re-arms both reminders, so
  extending a date works. Three days for the notification and seven for the
  dashboard card, for a stated reason: the card is passive and waits to be seen,
  the notification fires once and should land near the date. Both numbers live
  in `lib/offer.ts`. Separately, **clicking either offer notification used to
  open Conversations** — the one page that cannot fix what it is about; it now
  opens Knowledge Base.

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

**Read it with one caution.** It has not been reset since 17 Sept, so it is a
cumulative record of work the platform *has* done, not work it still does. The
single largest application entry — the conversations-with-`leads!inner` shape at
74,460 calls and 1,344 s — was fixed by migrations 127/128 and has taken 258
calls since; its comment in `app/api/conversations/search/route.ts` records the
number it had at the time. Before acting on an entry, read the live code that
would produce it and confirm the shape is still issued.

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
- [ ] **Realtime WAL decoding — 2,346,777 calls, 14,143 s, still ten times
  anything else.** Half done. `messages` is on `REPLICA IDENTITY USING INDEX`
  and **verified live by the owner on 2026-10-31** — list reordered, unread
  count moved, message appeared in an open thread, no refresh. `conversations`
  is still FULL and is the bigger half (~4×): migration 144, one command, with
  145 as the rollback. Runbook and a log of what has been done:
  `docs/realtime-wal-change.md`.
  Worth doing a day apart rather than back to back, and not out of caution for
  its own sake: five minutes of one person watching is not the same evidence as
  a day of twelve clients using it, and a failure mode that only shows on a
  DELETE event or an agent-scoped subscriber would not have appeared yet.
  **The earlier note had the order backwards.** It said `messages` "is where the
  volume is" and that `conversations` could not be changed. Measured over 44
  days: `conversations` 118,382 updates at 934 B/row against `messages` 41,128
  at 669 B — `conversations` is about four times the burden, and it CAN take a
  replica identity index. `workspace_id` and `id` are both NOT NULL, so
  `(workspace_id, id)` is a valid one.
  What the note got right: `assigned_agent_id` is nullable and cannot be in the
  index, so for `conversations` a DELETE event may not reach subscribers and a
  deleted conversation could linger until refresh. Accepted because it is
  measurable — **0 deletes in 44 days** — and the failure is a stale row, not
  lost data. `messages` has no degraded case at all: its policy needs only
  `workspace_id` and `conversation_id`, both NOT NULL, so its index carries
  everything the policy needs.
  Also found while measuring, and the better fix if it is ever worth the risk:
  **one inbound message causes five separate single-column UPDATEs to the same
  conversation row** — `last_message`, `is_spam`, `sentiment`, `unread_count`,
  `consecutive_offtopic` (15,028 / 14,536 / 12,394 / 10,792 / 6,882 calls) —
  each carrying all 934 bytes. Collapsing them into one would cut four fifths of
  the biggest contributor without touching Realtime at all. Not done because
  they are scattered across a 3,800-line webhook, several inside
  fire-and-forget blocks with their own ordering; that is a careful change, and
  this one is a single ALTER with a one-line rollback.
- [x] 2026-10-30 — **The inbound path's round trips, measured and reduced.**
  Four reads an ordinary message paid for in series are now one wait or gone:
  * `campaign_recipients` by contact, `wa_form_sessions` by conversation and the
    first-inbound probe are started together after the message row is written
    and consumed where they were consumed before, so which handler wins a
    message is unchanged. The by-phone campaign fallback joins them instead of
    waiting for the first to come back empty — which pg_stat_statements says is
    81% of messages.
  * `handleOptInOut` read the contact row the upsert four lines above had just
    returned. `opted_out` joined that select; the query is gone.
  * Three handlers (order status, CSAT, auto-CSAT) re-read the workspace they
    were handed, for the two fields needed to send a reply. Passed in now.
  * Two exact counts asked "how many?" where the answer needed was "more than
    one?". An exact count has no LIMIT, so the cost grew with the length of the
    conversation; both are bounded probes now, as are the spam check's two
    counts, which also ran one after the other for no reason.
  `startRead` is the mechanism, and its rejection handler is load-bearing: a
  pre-started read with no handler attached turns a transport failure into an
  unhandled rejection, which in this process is a dead webhook.
  **Migration 135 is the other half and the larger win** — `campaign_recipients`
  had no index on `phone`, so that 81% of messages ran 13.3 ms instead of 0.1 ms
  (160 s of database time since 17 Sept), and 717 ms against the largest
  workspace, scanning 321,929 rows to return nothing.
- [x] 2026-10-30 — **Four counts and an update on every delivery receipt.** Each
  'delivered'/'read'/'failed' webhook that advanced a recipient row re-aggregated
  the campaign's totals with four separate exact counts and then wrote them back:
  five round trips, four scans of the same rows, on the path between one receipt
  and the next. The three `status IN (...)` counts share one pg_stat_statements
  entry at **113,905 calls, 3.7 ms mean, 417.3 s** — ~38,000 receipts × 3, with
  the `status = 'failed'` count its own entry on top. **The largest application
  statement still being issued.**
  Now one statement that counts and writes in the same pass
  (`campaign_sync_delivery_counts`, migration 137). On the platform's largest
  campaign, 18,449 recipients: four counts ~31 ms / 2,604 buffers → one pass
  12.7 ms / 651 buffers, and five round trips → one. Verified across all 138
  campaigns with recipients: the FILTER math reproduces the four counts with
  **0 mismatches**.
  Left alone on purpose: `filtered_count` and `replied_count`. This path has
  never maintained them — replied_count is campaign-reply-sync's — and
  recomputing one from a delivery receipt would make this the second writer of a
  number it does not own.

- [x] 2026-10-31 — **`get_unanswered_conversations` examined and deliberately
  left alone.** 20,654 calls, 17.9 ms mean, 369.4 s — second on the cumulative
  list, and the measurement is what settled it: **369 s over 44 days is 8.4
  seconds of database time a day.** It is high on that list because it runs 469
  times a day, not because it is slow. Warm, the function is 13 ms and 9,780
  buffers; optimising it would be churn on a working cron for eight seconds.
  Worth recording because the first measurement said 424 ms, which looked like
  my own migration-136 index had made it 20× worse — it was a cold-cache read on
  an index created minutes earlier. Warm it is 5 ms. Re-measure before
  believing a regression.

- [ ] **Still sequential in the inbound path**: `contacts` upsert → `conversations`
  read → `conversations` upsert → `messages` insert, which is four round trips
  that genuinely depend on each other. Collapsing them needs one database
  function, not more batching. Measure before doing it — the four are all
  sub-millisecond index operations today.
- [x] 2026-10-30 — **272 seconds of database time spent asking one question six
  times.** Every dashboard and analytics page counted each delivery bucket with
  its own exact count over the same rows: `/api/dashboard/overview` six,
  `/api/analytics/extended` four, `/api/analytics/detail` five, and the admin
  volume trend twelve (2 directions × 6 months). Measured:
  `status = $3` 2,841 calls at 48.2 ms (136.9 s), `status = ANY($3)` 2,846 at
  47.8 ms (135.9 s), and the unscoped admin shape 204 at 92.9 ms (19.0 s).
  Each is now one GROUP BY — `analytics_message_status_counts` and
  `admin_message_volume_monthly`, migration 136 — and the cumulative-funnel rule
  that three routes each restated in a comment lives in `outboundDeliveryFunnel`.
  Verified against production before shipping: the four buckets the old counts
  returned for Razorveda's October (2704 / 2645 / 2274 / 13) are reproduced
  exactly, and are the fixture in `lib/message-status.test.ts`.
  **Why one count cost 48 ms on an 84k-row table:** `messages` was indexed on
  `workspace_id` alone and on `(conversation_id, created_at DESC)`. Neither
  serves "this workspace, this date range", so the planner combined them and
  read the conversation index end to end — `created_at` is its *second* column
  and cannot be seeked. 1,971 buffers per count to total 2,645 rows.
  `idx_messages_workspace_created` on `(workspace_id, created_at) INCLUDE
  (direction, status)` is the fix, and it serves `analytics_message_daily` and
  `analytics_message_heatmap` too.
  Found alongside it: **two byte-identical indexes on `whatsapp_msg_id`**, one
  unique and one not. The duplicate returned 1 tuple in 2,838 scans while being
  written on all 30,430 message inserts in the period; dropped (10 MB).
- [x] 2026-10-30 — **The two expensive lateral joins were the Meta Leads page,
  fetching whole threads to show one message.** Measured: the list query 473
  calls at 476 ms (225.2 s, the single largest statement on the platform), the
  CSV export 89 at 1,177.8 ms (104.8 s). Both embedded `messages` with no limit
  to display one field — the customer's opening message — then filtered, sorted
  and took the first in JS. The export did it for BOTH directions: a platform-wide
  export read **40,864 message rows to fill 3,940 CSV cells**, all of them
  json_agg'd and serialized. Now ordered and limited in the database, which
  `idx_messages_conversation` already serves: one row per conversation.
  The list query's larger half was `messages!inner`. PostgREST turns an inner
  embed into an `EXISTS (SELECT … FROM messages …)` on the exact-count side,
  which has no LIMIT — so one page load ran it once per labelled conversation in
  the workspace, 1,699 times for Umang Hospital, 8,090 of the query's 9,209
  buffers. It filtered nothing: the label is applied when an inbound ad-referral
  message arrives, and 0 of 3,940 labelled conversations platform-wide have no
  inbound message. Measured after: **9,209 buffers → 906, 14.75 ms → 3.58 ms**
  locally, and the saving should be larger in production, where RLS adds a
  function call to every row that EXISTS loop touched.
  Deliberately NOT added: a GIN index on `labels`. For Umang Hospital 1,699 of
  the workspace's 2,320 conversations carry the label, so it is barely selective
  within a workspace and the bitmap scan would still read most of the rows.
- [x] 2026-10-31 — **Meta Leads filtered `platform` in JS, after pagination.**
  25 rows fetched, some kept, and `total` / `totalPages` taken from the
  unfiltered count — so choosing Instagram showed an almost-empty page and
  claimed 158 more of them. **It needed neither a generated column nor an RPC:**
  the note saying `meta->ad_source` is not filterable by PostgREST was wrong,
  and `meta->ad_source->>platform=eq.instagram` works. Pushed into the query,
  in the list and the CSV export, through one shared helper so a CSV cannot
  disagree with the screen it came from.
  Latent until now: all 3,952 ad leads on the platform are `facebook`, so the
  filter returned either everything or nothing. It starts mattering the day
  Instagram ads are switched on, which is on the roadmap.
  The facebook case has a wrinkle worth its test: the page shows
  `adSource.platform ?? 'facebook'`, so a lead with no platform stored displays
  as facebook, and filtering on the stored value alone would hide a row the same
  page labels facebook. 10 tests.

- [ ] **`idx_messages_workspace` should now be redundant** — it is a prefix of
  `idx_messages_workspace_created` (migration 136), and its 40,036 scans read
  263 million tuples, which is the bitmap plan that index was added to replace.
  Confirm against real plans after 136 has been live a while, then drop it.

- [x] 2026-10-31 — **The in-memory `Map` caches were not the risk; the campaign
  claim was.** This item said `lib/ai-reply.ts` and `lib/campaign-executor.ts`
  "cache per-container, so a second app instance would serve stale personas and
  double-send". Checked: `ai-reply.ts` holds only constant arrays,
  `campaign-executor.ts` has no module-level state at all, and the codebase's
  one mutable module cache is `offTopicCache` in `flow-engine.ts` — 60 seconds
  of off-topic terms per workspace. Moving that to Redis would buy a 60-second
  consistency window on an off-topic classifier. Not worth a change.
  **The double-send was real, and it did not need a second container.** See the
  entry below; it was happening on one.

- [x] 2026-10-31 — **30,686 duplicate campaign sends, and the three reasons.**
  Found while checking the claim above. Measured on production: **27,203 phone
  numbers received the same campaign twice or more**, across 43 campaigns, every
  extra row carrying its own `whatsapp_msg_id` — so Meta delivered and charged
  for all of them. Most recent: 28 October. 14,601 of the pairs are **less than
  a minute apart** and another 11,778 within 25 minutes, so 97% are concurrent
  runs rather than a client re-sending.
  On WhatsApp this is not cosmetic: the same marketing message twice in a minute
  is what drops a number's quality rating, and Meta throttles or bans on that.
  1. **Nothing claimed the campaign.** `executeCampaign` refused only
     `status === 'completed'`, and a campaign mid-send is not completed. It now
     claims with one conditional UPDATE, which Postgres serialises — the second
     run gets no row and stops. Three callers were pre-setting `running`
     themselves and would have had their own run refused; all three now leave it
     to the claim.
  2. **The "stuck job" test was wrong, and it was the main cause.** The queue
     cron reset any job started more than 20 minutes ago, assuming a dead
     serverless request — but this is Coolify, where nothing kills a route
     handler, and real campaigns here run for **94 to 2,910 minutes** (measured:
     18,449 recipients took 118 min; 2,286 took 48 h). So the reset fired during
     live sends, handed the job back in the same tick, and started a second
     executor. The test is now "nothing has happened for 20 minutes", using the
     heartbeat that already existed — `sent_at`, written every 25 recipients.
     `lib/campaign-stuck.ts`, 9 tests.
  3. **The queue claim was select-then-update**, so two ticks could take the
     same job. Now conditional on it still being `pending`.
  Found on the way and fixed with it: **Cancel did nothing.** It set the
  campaign to `failed` and the executor never looked, so a client who stopped a
  48-hour campaign watched it keep sending. The send loop now checks the status
  at each flush — one read per 25 recipients — and the final write will not
  overwrite a status someone else set, so a cancelled campaign no longer reports
  itself completed.

- [x] 2026-10-31 — **The duplicate sends are now noticed, and someone is told.**
  The only reason 30,686 of them were ever found is that someone went looking
  for an unrelated thing. Two gaps, both closed:
  A daily check (`campaign_duplicate_sends`, migration 143) counts phone
  numbers sent the same campaign twice in the last 24 hours. **Any duplicate is
  an error, not a warning** — there is no acceptable number, because on WhatsApp
  the same marketing message twice is what drops a number's quality rating. A
  check that cannot run reports that it could not, rather than reading as clean;
  "no duplicates" and "could not look" were indistinguishable for months.
  And the health monitor **wrote a row and stopped**. An error report was "kept
  until manually resolved" in a table nobody opens — the same failure mode as
  the bug it now watches for. It emails platform admins on `critical`, and only
  when the previous report was not also critical: a daily email that always
  arrives is one nobody reads, and the point of this one is that its arrival
  means something.
  Also added `idx_cr_campaign_sent` — the heartbeat lookup that now decides
  whether a live campaign gets reset was reading all 18,449 rows of the largest
  campaign to find one timestamp, every five minutes. Deliberately no index for
  the detector itself: a 50 ms parallel scan run daily is not worth maintaining
  an index on ~100k sends a month.

- [x] 2026-10-31 — **A duplicate send is now impossible, not merely unlikely.**
  The recipient row is reserved as `queued` BEFORE the message goes out, and a
  partial unique index on `(campaign_id, phone) WHERE status = 'queued'`
  (migration 147) makes a second reservation for the same phone impossible
  while the first is in flight. The claim stops two runs beginning; this stops
  them overlapping if they ever do.
  Partial on purpose: the 27,379 existing duplicate pairs are a true record of
  messages that went out, and deleting them for a plain unique index would swap
  one wrong number for another.
  **The trade, and why it went this way.** Exactly-once is not available — Meta
  takes no idempotency key — so a process dying between send and settle leaves a
  row whose fate is genuinely unknown. Those stay `queued` and are **never
  retried automatically**: a missed message costs one lead, a duplicate costs
  the client's number quality rating and Meta throttles on that. A batch of five
  is reserved immediately before it is sent, so a crash leaves at most five
  phones in doubt. Resume releases them (10-minute floor), because that is a
  person deciding to take over a dead run.
  Four things found while building it, each of which would have shipped a quiet
  wrong answer:
  * `campaign_recipients` has **no `created_at`** — only sent/delivered/read/
    replied_at. The release function was written against it and, being plpgsql,
    would have failed at runtime the first time someone clicked Resume. Added
    an explicit `reserved_at` rather than writing the reservation time into
    `sent_at`, which is the cheap way and the wrong one.
  * The recipients table in the UI does
    `STATUS_CFG[r.status] ?? STATUS_CFG.sent`, so a reserved row would have been
    labelled **"Sent"** before it was sent. It now reads "Sending…".
  * A reservation failure now **fails closed** — the batch is skipped, not sent
    unprotected. That error path would otherwise have quietly restored the old
    behaviour exactly when it mattered.
  * A settle failure is loud but not fatal: the messages have already gone out,
    and throwing would lose the record of sends that really happened.
  Known limit, recorded rather than silently fixed: the reservation key is the
  raw `phone`, the same value the dedup has always used, so the same person
  stored once as `919000000001` and once as `+919000000001` is two
  reservations. Pre-existing; changing the key would move what the historical
  dedup matches on.
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
- [x] 2026-10-30 — **The two database-backed checks, at save time.** Both run
  on the SAVED row rather than the request body, because `is_active`, the
  trigger and the nodes are exactly the fields a PATCH may leave untouched — the
  body alone cannot answer "does this flow now collide with another?".
  The trigger check is not a duplicate-detector. The engine matches with
  `content.includes(keyword)`, so the SHORTER keyword swallows every message
  carrying the longer one: a flow on "Book" silently kills a flow on "Book Now".
  It reports both directions, because only one of them is visible from the flow
  the author is looking at — this flow never running, and this flow stopping
  another from ever running. Checked against the live set: Razorveda's four
  simultaneous active flows are clean, so nothing warns today.
  The template check knows a template is approved per LANGUAGE, so the name
  existing is not enough, and it names the languages the workspace does have. A
  node with nothing chosen is left to the pure validator, because saying it
  twice teaches people to skim.
  `lib/flow-validate-db.ts` is pure and takes the rows as arguments (23 tests,
  no database); `lib/flow-save-warnings.ts` is the only part that reads one, and
  it fetches the template list only when a flow actually has a template step.

- [x] 2026-10-30 — **`chatbot_flows` had no `priority` column** though
  `flow-engine.ts` sorted on `flow.priority ?? 0`. Added by migration 142 with a
  control on the Start step, as part of the richer-triggers work in P5.
- [x] 2026-10-30 — **Plain-language flow summary** above the builder, derived
  from the nodes on every render so it cannot drift. A branching flow is not
  flattened into one sentence — that would describe a flow that does not exist;
  it gets the trigger, a step count, and where to look.
- [x] 2026-10-30 — **Vertical template packs**: gym, clinic, salon and spa,
  resort, D2C, real estate, coaching, software demo — copy in the mixed Hindi
  and English these businesses write to their own customers, grouped by trade in
  the picker. Each one uses a Wait, an Action and tap-to-answer buttons, because
  a client finds a step by meeting it, not by being told it exists. Every
  template is run through the editor's own validation, the step list, the
  summary and the simulator in tests — a starting point that warns in the editor
  is not a starting point.
- [x] 2026-10-30 — **AI flow builder, rewritten against the real palette.** The
  prompt described six node types while the builder has thirteen, so every flow
  it produced was assembled from the May version of the editor — no Wait, no
  Collect, no Template, no AI Reply. A generated flow was always *less* than a
  client could build by hand, which is the opposite of the point. The palette is
  now described field by field, from what each handler actually reads, and a test
  fails if a node type is added to the registry without being described — which
  is how this drifted in the first place.
  The prompt also carries the rules a flow cannot recover from at runtime: ask
  for a name or phone with Collect and not Question, offer tap choices when the
  answers are a known set, and never put a plain message after a wait of more
  than 24 hours, because WhatsApp refuses it and nobody is told.
  **On the unreproduced 502:** `jsonMode` is the only thing this route did that
  no working AI path in the codebase does, and it is passed to every provider in
  the failover chain — so a model that rejects `response_format` makes both
  providers fail and the whole call return null, which matches "it 502s while
  auto-replies generate fine the same hour". It now retries once without JSON
  mode, and the parser reads a fenced or prefixed reply either way. Not proven,
  but the single point of failure is gone and the error still names the model and
  the chain that were tried.
  The reply is normalized before the author sees it, and only unambiguously:
  a node type the registry does not know (the engine ends the session on one), an
  edge to a node that was never written, a missing Start, a duplicate id, a
  missing position. A branch handle that does not match the node's branches is
  left exactly as drawn and reported — choosing a different branch would be a
  guess the author never sees. Every repair is named in the toast, and the flow
  opens with the warning panel already showing. 24 tests.

## P5 — Flow builder Phase 3: power

- [x] 2026-10-30 — **Template node.** The only message WhatsApp allows more
  than 24 hours after the customer last wrote, so a long Wait finally leads
  somewhere. The editor picks from the workspace's approved templates, shows
  the approved wording, counts the template's own {{1}}, {{2}} blanks from its
  body and lets each be filled from a saved answer. The 24-hour warning goes
  quiet when a Template follows the wait and stays loud when a plain message
  does — both have tests.
- [x] 2026-10-30 — **AI Reply node.** Hands one turn to the workspace's persona
  and knowledge base, then carries on. Behind an `ai` facade like `send` and
  `ops`, so the handler keeps no server-only import and the simulator runs it
  unchanged — the simulator makes no model call and says so in the transcript
  rather than showing the fallback as though it were the answer. The fallback
  line is the client's own, because a provider outage once sent every client
  the same generic sentence.
- [x] 2026-10-30 — **Webhook node** — posts what the flow has collected to a URL
  the client controls and reads values back, with `ok` and `failed` branches
  because an outside system is the one part of a flow nobody here controls.
  It is also how a per-workspace Sheets export stops needing its own code.
  **It carries an SSRF risk by nature** — a client-supplied URL called from our
  servers — so private, loopback, link-local and internal addresses are refused
  and only http(s) is allowed, with tests. A hostname check cannot stop a name
  that resolves to a private address afterwards; the real fix is making the call
  from somewhere with no private network to reach, and that is still open.
- [x] 2026-10-30 — **Collect** — a question that checks the answer, re-asks in
  the author's own words, and gives up down its own branch rather than asking a
  fourth time. A bad answer is never saved, the attempt count lives in the
  session so a customer who returns a day later is not silently on their last
  try, and smart extraction is off here because guessing works against a step
  whose job is to check.
- [x] 2026-10-30 — **Switch, Jump and Split.** None of the three says anything;
  each one decides where the flow goes, which is the half of the palette that
  did not exist.
  **Switch** is one subject with an ordered list of cases and a real `default`
  branch. It replaces three Conditions in a row — and those were worse than
  verbose: every one of them judged the same message, so which test ran first
  decided the flow and nobody reading the canvas could tell. It can also judge a
  saved answer against another saved answer, which a Condition cannot do at all.
  **Jump** continues at another step in the same flow, which is how four
  branches share one ending instead of the same three messages copied into each.
  It stays within the flow on purpose: a session belongs to one flow, and
  jumping into another would mean a session half in each, with two triggers and
  two sets of answers. The validator now treats a Jump as a connection — without
  that, the shared tail read as unreachable and the Jump as a dead end, two
  confident warnings about a flow that works, which is how a validator gets
  ignored.
  **Split** decides its arm from a hash of the session id, not from
  `Math.random`. A customer who goes quiet and replies tomorrow lands in the arm
  they were already in, the simulator shows what production will do, and a test
  can assert it. An arm weighted 0 keeps its branch wired but takes no new
  people, so an experiment ends without cutting off the sessions inside the
  losing arm.
  **A test caught a real bug in that hash.** FNV-1a's last byte barely reaches
  the high bits, and the high bits are what picks the arm — so two Splits in one
  flow ("sess:sp-1", "sess:sp-2") sent every session down the SAME arm in both:
  two experiments silently measuring the same half of the audience. Fixed with
  an fmix32 finalizer, plus `Math.imul` for the multiply, which was losing low
  bits past 2^53. 30 tests.
  The simulator gained a "try as another person" control, shown only when the
  flow has a Split — with a fixed session id the author could only ever preview
  one arm of their own A/B test.
- [x] 2026-10-30 — **Richer triggers and active windows, for the
  message-driven half.** Seven trigger types where there were two: keyword,
  first message, **button or list reply** (by id or by its exact wording),
  **ad click** (any ad, or one ad id), **campaign reply** (any, or one
  campaign), **manual** (only a person or the API starts it), and
  **any_message** as a fallback.
  The matching moved out of flow-engine.ts into `lib/flow-triggers.ts`, and that
  is the substance of the change: it was two cases inline in a module no test
  can import without a database, so the order flows were tried in and what each
  type meant had no tests at all. Thirty-one now do, and the engine, the
  editor's conflict check, the canvas and the flow summary all read the same
  file — the canvas cannot disagree with the panel about what starts a flow.
  **Active windows** are IST, `from` inclusive and `to` exclusive, so
  "09:00–18:00" and "18:00–09:00" cover the day exactly once between them —
  which is the whole point, an after-hours flow and a working-hours flow sharing
  one trigger. `from` after `to` is overnight and belongs to the day it starts
  on, so "closed Sunday" does not cut a Saturday night flow off at midnight.
  The window is checked *after* the trigger, so an out-of-hours flow does not
  block the next candidate.
  Two deliberate rules, each the mistake its type makes easy: `any_message` is
  forced last whatever its priority, because a fallback that could win on age or
  on a number someone typed would swallow every specific trigger in the
  workspace; and `manual` never fires from a message, or a manual flow would run
  for everyone the moment it was switched on.
  **`priority` exists now** (migration 142) — the engine had been sorting on a
  column that was never there. The conflict warning can finally offer raising it
  as a remedy, and that check was extended to all seven types; it had been
  silently ignoring five of them. Ids compare by equality, not substring: an ad
  id that happens to contain another is a coincidence.
  Manual start is `POST /api/flows/[id]/start`. It refuses an inactive flow (so
  "off" means the same thing to everyone), a conversation already in a flow (two
  flows would interleave their questions and both read the same reply), and
  reads the workspace's own channel credentials rather than taking them from the
  caller.

- [ ] **The event-driven triggers**: lead created, tag added, temperature
  changed, conversation idle N hours, a schedule. Left out of the batch above on
  purpose — every one of them needs a new entry point (a cron sweep, or a hook
  where leads and tags change) rather than a reading of an inbound message, so
  they are a separate piece of work rather than two more cases in
  `triggerFires`. `manual` already covers "another system decides", which is the
  escape hatch for most of them today.
- [x] 2026-10-30 — **A cleanup job was deleting the sessions that were waiting
  on purpose.** Found while looking for data to build drop-off analytics on, and
  the reason there is none. `cleanup_stale_flow_sessions` (migration 052) ran
  every two hours and did `DELETE FROM flow_sessions WHERE updated_at < NOW() -
  INTERVAL '24 hours'`. A session parked on a Wait, or on a question's
  `timeoutHours`, stops touching `updated_at` for exactly as long as it is
  *meant* to be waiting — so every wake-up further out than 24 hours arrived to
  find its session deleted, and `resumeFlowSession` returned false in silence.
  **Live and measurable:** every question and collect step in Fitness First's
  and VMS's active flows carries `timeoutHours: 48` — 4 + 4 + 7 steps across
  three flows. Not one of those "if they don't reply in 48 hours" branches can
  ever have fired. The engine was taught to read `timeoutHours` and schedule the
  wake-up; this job deleted the session 24 hours before it came due. The Wait
  node and the Template node — which exists so a follow-up can land days later,
  outside WhatsApp's 24-hour window — were built on the same sand.
  Migration 139: a session with a wake-up pending is never touched (that guard,
  not the window, is what makes a 7-day follow-up as safe as a 48-hour one);
  stale means 48 hours and marks `expired` instead of deleting, which unblocks
  the contact just as well because the engine looks for `status = 'active'`; and
  finished sessions are kept 90 days. `/api/cron/cleanup-flow-sessions` had the
  same rule without the guard, so it now calls the same function — two cleanups
  with different ideas of "stale" is how this happened.
  `resumeFlowSession` now logs a missing session loudly and apart from a stale
  one. The silent `return false` is why this hid for months.

- [x] 2026-10-30 — **Per-node drop-off.** A completion rate says people are
  leaving; only this says where, and a step with 90 arrivals and 80 stops is
  invisible in any count of completions.
  `current_node_id` could not answer it — it says where a session is now, not
  which steps it passed, so "how many reached step 4" was unanswerable. The path
  is recorded by a trigger inside the UPDATE the engine already issues on every
  advance (migration 140): no extra round trip on the inbound path, and no lost
  append when two messages race, which a read-modify-write in the app would
  have. Affordable here and not on `messages` for one measured reason —
  `flow_sessions` is not in the `supabase_realtime` publication and has default
  replica identity, so a growing array costs nothing in WAL decoding.
  The judgements are in `lib/flow-dropoff.ts` and tested, not merely rendered:
  an End or a handoff is never blamed (otherwise a working flow reads as 100%
  drop-off at its last step), a step fewer than 10 people reached is never named
  as the problem (3 of 3 leaving is not a finding), and a step nobody reached is
  kept rather than hidden because it is usually the step after the one losing
  people. The panel's one-line summary says "too few so far to say" instead of
  filling the gap with a confident 0%.
  Verified the SQL against Postgres on a synthetic path set, including a looping
  path: a step reached twice by one person counts once. 17 tests.
- [x] 2026-10-30 — **Version history and rollback.** Non-technical people edit
  live flows, and a client who deleted the wrong branch at 11pm had no way back
  and no way to see what changed.
  The snapshot is taken by a trigger on `chatbot_flows`, not by the save route
  (migration 141). That is deliberate: this repository holds nine migrations
  that reached in and rewrote `nodes` directly, and those are the riskiest
  changes of all because nobody is watching when they run. A version written by
  the application would have missed every one of them. They are marked
  `source: 'sql'` and the panel says "changed directly in the database" rather
  than showing a blank where a name goes.
  A restore writes the version back, which fires the same trigger — so the
  state being replaced is kept and the restore is itself undoable. `is_active`
  is NOT restored: whether a flow is live is a decision about today, not a
  property of the version being brought back, and restoring an old shape must
  not silently switch a flow on. Active sessions in that flow are cleared, the
  call migration 133 made by hand — a customer parked on a step that no longer
  exists is worse than one who starts again.
  Each row says what the save did ("removed 2 steps", "rewired connections"),
  because a list of timestamps makes someone restore versions one at a time to
  find the one they want. Dragging a node is reported as moving steps, not as an
  edit. 15 tests.
  Capped at 50 per flow: a flow is saved by a person clicking Save, so 50 is
  months of editing, and the cap is what stops the history outgrowing the thing
  it is history of.

## P6 — Platform audit leftovers

From the 18-point program (2026-09-30). Migration 100 is applied.

**Checked one by one on 2026-10-31; this list was stale.** Five of the nine were
already built and never ticked. What they say now is what the code says.

- [x] #4 Team "Assigned Work" view — built:
  `modules/team/components/AssignedWork/index.tsx`, a tab in TeamPage, reading
  the existing `/api/tasks` and grouping by assignee.
- [x] #9 "AI Revenue Intelligence" — renamed. The page is headed "AI Lead
  Intelligence", its subtitle says lead scoring, and nothing on it claims money.
  Only the route path (`/ai-revenue`) still carries the old name, which no
  client sees.
- [x] #7 bookings/events workflow — built: `app/(dashboard)/bookings/`, plus
  Google Calendar and WhatsApp Forms settings.
- [x] #14 integrations architecture — built: Settings → Integrations, with
  per-channel tabs (GBP, Google Ads, Google Calendar, Meta Ads, Shopify).
- [x] #16 login — built, along with signup, verify-email, forgot/reset
  password, accept-invite, pending-approval and session-limit.
- [x] 2026-10-31 — #6 **billing and Meta-spend real-data states.** The real
  finding, and it was worth the look: Marketing ROI showed "Ad spend ₹0 / ROAS —
  / Net ROI —" under a heading promising "spend, revenue, ROAS and true ROI
  across every channel". A client could not tell whether they spent nothing or
  never connected an ad account — and **14 of the 15 workspaces have no ad
  account at all**, so almost every one was reading ₹0 as a counted figure. ₹0
  is a claim; "not connected" is the truth and the only one of the two a client
  can act on.
  Now: a dash instead of ₹0 when nothing is connected, and a line naming what is
  missing with a link to the right Settings tab. Only shown when there is
  something to say.
  **Two things verified against production rather than assumed, and both would
  have shipped wrong:** `settings.meta_ads` does not exist anywhere — the Meta
  config route writes `meta_ad_account_id` — and Google Ads keeps its customer id
  in its own `google_ads_connections` table, not in settings. A guess at either
  would have read "not connected" forever, including for Umang Hospital, which
  IS connected to Google Ads. That is the same bug class as the one being fixed.
  Also checked and clean: the marketing site's pricing is hardcoded and
  hand-synced with `billing_plans`, and all twelve amounts match today (GST
  stripped on both sides). The risk is structural, not current.
  `meta_ad_spend_daily` is empty because nobody has connected Meta Ads, not
  because the sync is broken — google-sync has succeeded every six hours.

- [ ] #10 dashboard polish, #12 UI/UX pass, #13 mobile, #15 landing design,
  #11 profile, #17 features research. **These have no finish line as written**
  and were left rather than pretended at. Each needs one concrete complaint to
  become a task: a page that is wrong, a screen that breaks at phone width, a
  number a client misread. Ask the owner for one before starting.

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
