# Changing replica identity on `conversations` and `messages`

Written for: the owner, at a keyboard, with the app open in a browser.

This is the one change on the platform that can break every client's live inbox
without throwing an error anywhere. It takes about ten minutes, most of which is
watching a screen. Do it when clients are quiet — early morning IST is best.

## What it is for

Realtime WAL decoding is the largest single consumer of database time here:
**2,343,638 calls, 14,123 seconds** (3.9 hours over 44 days) — about ten times
anything else on the platform.

Every table in the `supabase_realtime` publication is `REPLICA IDENTITY FULL`,
so every UPDATE writes the **entire old row** into WAL for Realtime to re-check
RLS against. Measured over the same 44 days:

| Table | Updates | Avg row | Rough WAL from old rows |
|---|---|---|---|
| `conversations` | 118,382 | 934 B | ~110 MB |
| `messages` | 41,128 | 669 B | ~27 MB |
| `notifications` | 16 | 203 B | — |

`conversations` is the bigger half by about 4×. One inbound message triggers
five separate single-column updates to the same conversation row —
`last_message`, `is_spam`, `sentiment`, `unread_count`,
`consecutive_offtopic` — and each one carries all 934 bytes.

## Before you start

Record the baseline so the change can be judged rather than just survived:

```bash
node database/query.mjs "SELECT relname, relreplident FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('conversations','messages','notifications')"
node database/query.mjs "SELECT pg_current_wal_lsn() AS lsn, now() AS at"
```

`relreplident` should read `f` for all three. Keep the LSN and the time.

## Step 1 — `conversations`

```bash
node database/run-migration.mjs migrations/144_conversations_replica_identity.sql
```

No redeploy. The change is live immediately.

## Step 2 — watch it for five minutes

Two tabs: **Conversations** open on the list, and one conversation open on its
thread. Then, from a real phone, send a WhatsApp message to a client number you
are allowed to test with.

Three things must happen **without refreshing the page**:

1. The conversation moves to the top of the list, with the new message preview.
2. The unread count changes.
3. If that thread is the one you have open, the message appears in it.

If any of the three needs a refresh, **stop and roll back** (below). Do not
reason about it; the whole point of this procedure is that you do not have to.

Also worth one look: send a reply from the inbox and confirm it appears in the
thread for the customer.

## If anything is wrong

```bash
node database/run-migration.mjs migrations/145_rollback_replica_identity.sql
```

Instant, changes no data, puts both tables back the way migration 047 left
them. Reload the page and confirm live updates return. Then tell me what
stopped working and I will stop proposing this.

## Step 3 — `messages`, on a different day

Only once step 1 has held for a day or two.

```bash
node database/run-migration.mjs migrations/146_messages_replica_identity.sql
```

Then watch for the same three things. **Not in the same sitting as step 1** — if
the inbox breaks after two changes, you do not know which one did it.

`messages` is the safer of the two: its RLS policy needs `workspace_id` and
`conversation_id`, both NOT NULL, so its replica identity index carries
everything the policy needs and even DELETE events stay fully checkable.

## Did it help?

A day after each step:

```bash
node database/query.mjs "SELECT calls, round(total_exec_time::numeric/1000,1) AS total_s, round(mean_exec_time::numeric,2) AS mean_ms FROM pg_stat_statements WHERE query LIKE '%wal%' AND query LIKE '%realtime%' ORDER BY total_exec_time DESC LIMIT 1"
```

`pg_stat_statements` is cumulative since 17 September, so the total only ever
grows — what to watch is **mean_ms**, currently 6.03. If it does not move, the
change was not where the cost was, and rolling it back costs nothing.

## The honest caveat

Everything above about which WAL records Realtime needs is reasoning about
Supabase's `walrus`, not a reading of it. The reasoning says INSERT and UPDATE
events are evaluated against the new row — which is logged in full whatever the
replica identity — and that only DELETE depends on the old row.

Migration 047 set `FULL` because reverting it once already caused exactly this
failure, so the reasoning has been wrong before, in a way nothing reported. That
is why this is one table at a time, with five minutes of watching and a one-line
way back.

## Known degraded case, `conversations` only

Its policy is `can_view_assigned_row(workspace_id, assigned_agent_id)` and
`assigned_agent_id` is nullable, so it cannot be in a replica identity index.
After step 1, a **deleted** conversation may linger in an open inbox until the
page is refreshed.

Accepted because it is measurable: `conversations` has had **0 deletes in 44
days**. The Delete Conversation feature exists, so it is rare rather than
impossible, and the failure is a stale row until refresh — not lost data.
