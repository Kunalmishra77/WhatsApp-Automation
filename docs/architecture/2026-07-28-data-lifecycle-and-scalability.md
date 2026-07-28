# Data Lifecycle & Scalability Architecture

**Date:** 2026-07-28
**Scope:** Permanent, evidence-based data-management and scaling strategy for the AGENTiX WhatsApp Automation platform.
**Method:** Audited the live production database (Supabase Postgres, project `yvqaproltcskufufmomi`, ap-south-1) and the codebase directly. No assumptions — every number below is measured.

---

## PART A — AUDIT FINDINGS (measured)

### A.1 Database size breakdown
Total database: **1,160 MB.**

| Table | Total | Heap | Index | Rows (real) | Notes |
|---|---|---|---|---|---|
| **whatsapp_webhook_events** | **1,003 MB (86%)** | 898 MB | 99 MB | **704,135** | Raw inbound webhook log. ~12k rows/day, oldest 2026-05-31, **never deleted**. Server-only (RLS denies all). |
| vector_documents | 56 MB | 8.5 MB | 33 MB | 0 live | RAG embeddings; index/TOAST **bloat** (0 rows, 56 MB). |
| campaign_recipients | 43 MB | 23 MB | 21 MB | 636 | Grows with (campaigns × recipients). Future #1 at scale. |
| messages | 23 MB | 12 MB | 7 MB | 42 | Declared partitioned but effectively empty. |
| contacts | 6.3 MB | 2.2 MB | 4 MB | 9 | |
| conversations | 5.8 MB | 2 MB | 2 MB | 9 (65 dead) | Bloat from frequent `last_message` updates. |
| everything else | < 2 MB each | | | | negligible |

> **Headline:** 86% of the paid database is a **raw webhook debug log** that grows ~12,000 rows/day and is never pruned. This is why storage keeps filling and why compute upgrades only delay the problem — the log refills any disk you give it.

> **Stats note:** planner stats were stale (reported 1,225 rows; real count 704,135) because `ANALYZE`/autovacuum had not run since the compute restart. This itself is a finding — autovacuum on the high-churn webhook table is not keeping up.

### A.2 Index findings
- `idx_whatsapp_webhook_events_status` — **45 MB, 0 scans** (unused/bloated).
- `idx_whatsapp_webhook_events_message_ids` (GIN) — **24 MB, 0 scans**.
- `vd_embedding_idx` (pgvector) — **31 MB for 0 rows** (bloat).
- `idx_messages_whatsapp_id` — redundant with `messages_whatsapp_msg_id_unique` (same column, one used, one not).
- Several FTS/GIN indexes with 0 scans (`idx_contacts_fts`, `idx_conversations_fts`, `idx_conversations_meta_gin`). *Caveat: scan counters reset at the restart, so re-measure over a full day before dropping the FTS ones; the 45 MB + 24 MB webhook indexes are bloated regardless.*

### A.3 Bloat & autovacuum
- Heavy churn tables (`whatsapp_webhook_events` 2 updates/row, `conversations` 155 updates/9 rows) accumulate dead tuples.
- Autovacuum has not caught up on the webhook table. No `VACUUM` reclaim scheduled.

### A.4 What already exists (good foundations)
- **Redis (Upstash) is already integrated** (`lib/rate-limit.ts`) for auto-reply / API / webhook / WA-outbound rate limits. Optional (no-ops if `UPSTASH_*` env not set). → Caching/queue infra is one env-var away.
- **pg_cron + pg_net** installed, with live jobs: `stale-flow-session-cleanup` (2h), `retention-due-check` (daily), `sla-breach-check` (15 min), `cleanup-expired-sessions` (hourly).
- **Retention exists but is notify-only:** `check_retention_due()` reads `workspaces.settings.retention_months` (default 2), counts old conversations, and **inserts a notification**. It does **not** archive or delete, and does **not** cover `whatsapp_webhook_events` or campaign data. Actual delete/export is manual via `/api/workspace/retention`.
- **Multi-tenant isolation is solid:** every table has `workspace_id` + RLS (`is_workspace_member`). `whatsapp_webhook_events` correctly denies all client access.
- **pgvector 0.8** for embeddings; **pg_stat_statements** enabled (slowest real query: a `conversations` select at ~306 ms mean — otherwise healthy).
- Object storage available via Supabase Storage (`storage.objects`).

### A.5 Answering "what is causing growth?"
1. **`whatsapp_webhook_events` (86% today, and unbounded).** Disposable log with no retention. **Primary cause.**
2. **`campaign_recipients` + `messages` (future primary).** Scale with campaign and message volume — currently tiny, but at 100–1,000 clients these dominate.
3. **`vector_documents` bloat** — embeddings churn leaves index/TOAST bloat.
4. **Table bloat** from high update-churn tables without adequate vacuum.

---

## PART B — DATA CLASSIFICATION (4 tiers)

| Tier | Meaning | Storage | Tables |
|---|---|---|---|
| **T1 — Active operational** | Needed for the app to run day-to-day | Primary Postgres | tenants/workspaces, users, workspace_members, campaigns, contacts, chatbot_flows, templates, knowledge_base, subscription/billing, config/flags, **recent** conversations & messages (≤ 90 days) |
| **T2 — Historical** | Reportable, rarely queried | Object storage (R2/Supabase Storage), aggregated metrics in PG | messages & campaign_recipients of **completed** campaigns past retention, old conversations, resolved tickets |
| **T3 — Cold archive** | Legal/compliance, almost never read | Object storage (cheapest class), Parquet/JSON.gz | exported campaign datasets, > 1-year data |
| **T4 — Disposable** | No long-term value | Postgres **with TTL** or Redis | **whatsapp_webhook_events**, webhook_deliveries, automation_trigger_logs, platform_usage/health logs, flow_sessions, expired sessions, rate-limit counters, idempotency keys, temp export files |

---

## PART C — RETENTION POLICY (recommended, configurable)

Configurable at three levels: **Platform default → Tenant/plan policy → Campaign override.**

| Data | Default retention in Postgres | Then |
|---|---|---|
| `whatsapp_webhook_events` | **7 days** | hard delete (partition drop) |
| webhook_deliveries / automation logs / usage logs | **30 days** | delete |
| flow_sessions (stale) | 24h (already) | delete (already) |
| Messages / conversations (operational hot) | **90 days** | archive to object storage, then delete from PG |
| Campaign + campaign_recipients | **completed_at + 90 days** (plan-configurable) | notify → 14-day grace → export/archive → delete |
| Analytics raw events | roll up nightly; keep raw **30 days** | delete raw, keep aggregates |
| Exports (in object storage) | **7–30 days** | auto-delete |
| Audit/deletion log (metadata only) | **keep** (small, no payloads) | — |

**Plan-based overrides:** Starter 30–60 d · Pro 90 d · Enterprise 180–365 d or custom. Legal-hold flag pins data and blocks deletion.

---

## PART D — CAMPAIGN-BASED LIFECYCLE

Add lifecycle columns to `campaigns` (they don't exist yet):
`retention_until`, `archive_status` (`active|archiving|archived|deleting|deleted`), `archive_location`, `deletion_scheduled_at`, `deleted_at`, `legal_hold boolean`.

```
Created → Active → Completed → Retention window → Client notification
→ Export available → Grace period (14d) → Archive to object storage → Delete from PG → Audit log
```

**Dependency graph for campaign deletion** (dependency-aware, not one row):
```
campaign
 ├── campaign_recipients      (bulk; partition-drop or batched delete)
 ├── campaign_queue           (delete)
 ├── conversations (campaign-originated) ── messages   (archive then delete)
 ├── webhook/delivery events  (already TTL'd)
 ├── analytics (raw)          (already rolled up)
 └── media references         (dereference; object lifecycle deletes files)
```
Use FK `ON DELETE CASCADE` for cheap child rows; **partition drop** for the high-volume ones; explicit batched workers for archive-before-delete.

---

## PART E — TARGET ARCHITECTURE

```
                         CLIENTS
                            │
                     APPLICATION API (stateless, horizontally scalable)
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   PostgreSQL            Redis (Upstash)     Job Queue (Upstash/pg-boss)
 (T1 transactional)   cache · rate-limit ·   async workers
        │              idempotency · locks         │
        │                                          ▼
        │                                 Worker services
        │                          (archive · export · delete · rollup · cleanup)
        ▼                                          │
   Active data                             Archive pipeline
                                     ┌────────────┴────────────┐
                                     ▼                         ▼
                            Object storage (R2)         Cold archive (R2 IA)
                            exports · archives · media   long-term
                                     │
                                     ▼
                              Export system (signed URLs, TTL)
```

**Component choices (evidence-based):**
- **Postgres (Supabase):** stays the source of truth for T1 only. With lifecycle, it stays small → smallest viable compute.
- **Redis:** Upstash (already a dependency) — provision `UPSTASH_*`. Use for cache, rate-limit (done), idempotency keys (replace the webhook table's dedup role), job locks, transient campaign/queue state.
- **Object storage:** **Cloudflare R2** (S3-compatible, **zero egress fees** — ideal for exports/archives) or Supabase Storage to start (already available, simplest). MinIO only if self-hosting.
- **Queue/workers:** start with **pg-boss** (Postgres-backed, no new infra) or Upstash QStash; graduate to a dedicated worker service at scale. Coolify already hosts the app → add a worker process.
- **Analytics:** nightly rollup into `*_daily_metrics` tables; dashboards read aggregates, never scan raw events.

---

## PART F — DATABASE OPTIMIZATION

1. **Partition high-volume tables by month** (time-based) so deletion = `DROP PARTITION` (instant, zero bloat, no `DELETE`/`VACUUM`):
   - `whatsapp_webhook_events` (by `received_at`)
   - `messages` (by `created_at`) — finish the partitioning already started
   - `campaign_recipients` (by campaign `created_at`, or list-partition by campaign at very high volume)
2. **Drop bloated/unused indexes:** the 45 MB status + 24 MB message_ids webhook indexes (replace dedup with a Redis idempotency key), the 0-row `vd_embedding_idx` (rebuild after re-populating), redundant `idx_messages_whatsapp_id`. Re-measure FTS indexes over a full day first.
3. **Vacuum/bloat:** tune autovacuum to be aggressive on churn tables (`autovacuum_vacuum_scale_factor = 0.02` on webhook/conversations); one-time `VACUUM FULL`/`pg_repack` after the first big prune to reclaim ~950 MB.
4. **Queries:** cursor-based (keyset) pagination for messages/contacts/recipients lists — never `OFFSET` on large sets; never load full result sets into the app.
5. **RLS at scale:** ensure every RLS predicate (`is_workspace_member`, `workspace_id`) is index-backed; consider `SECURITY DEFINER` RPCs for hot admin/analytics paths to avoid per-row policy cost.
6. **Connections:** keep using the Supavisor pooler (port 6543, transaction mode) for the serverless app; reserve the direct port for migrations/workers only.

---

## PART G — EXPORT & DELETION WORKFLOWS (async)

**Export (never synchronous):**
```
Client requests export → create export_job row (queued)
→ worker streams data in batches → writes CSV/JSON/ZIP to R2
→ signed URL (TTL 7d) → notify client → download → auto-expire & delete file
```
Formats: CSV, JSON, ZIP (+ optional media). Contents: contacts, statuses, messages, delivery reports, campaign metadata, analytics.

**Deletion (dependency-aware, auditable):**
```
Trigger (retention/manual/admin) → check legal_hold → snapshot minimal audit metadata
(who/when/campaign/categories/counts) → archive-if-required → partition drop / cascade delete
→ verify → write deletion audit row (no payload retained)
```
Every job: **idempotent, retryable, resumable, observable, rate-limited.**

---

## PART H — MULTI-TENANCY & SCALING ROADMAP

Current model — **shared database, RLS-isolated by `workspace_id`** — is correct and scales well **to ~1,000 tenants** *provided* the high-volume tables are partitioned and lifecycle-managed. Do **not** move to database-per-tenant prematurely (only for compliance/isolation contracts).

| Stage | Est. DB size *(with lifecycle)* | Infra | Notes |
|---|---|---|---|
| **Today (~6–9 active)** | 1.16 GB → **~160 MB after prune** | MEDIUM compute + Upstash + R2 | Prune webhook log = immediate 86% reduction |
| **100 clients** | ~5–15 GB | SMALL/MEDIUM compute, Upstash, R2, 1 worker | partitioning + monthly drops keep PG flat |
| **200 clients** | ~15–30 GB | MEDIUM/LARGE, 2 workers, read patterns cached | add read replica if dashboards get heavy |
| **500 clients** | ~40–80 GB (hot only) | LARGE, read replica, dedicated worker fleet | analytics fully on aggregates |
| **1,000+ clients** | hot set bounded by retention, not total history | LARGE/XL + replica; consider sharding by tenant-hash or region | evaluate Citus/sharding only past this point |

**Thresholds:** shared-DB + partitioning → **default to ~1,000 tenants**; introduce read replicas when dashboard read latency degrades; consider sharding/separate DB per shard only past ~1,000 tenants or for compliance.

---

## PART I — MONITORING & ALERTING

- **DB:** size, per-table growth rate, dead-tuple ratio, connection %, CPU/mem/IOPS, slow queries (pg_stat_statements), cache-hit ratio, autovacuum lag.
- **App:** API latency, error rate, throughput, queue depth, worker failures, job duration.
- **Storage:** object-storage usage, archive growth, export cleanup success.
- **Alerts:** DB storage > 70% / > 85%; abnormal daily growth (e.g. any table > X MB/day); connection util > 80%; queue backlog; failed cleanup/archive/deletion jobs. Alert **before** critical, not after.
- Supabase has native reports; add a lightweight daily `platform_health_reports` rollup (table already exists) + external alerting (email/Slack via the existing notification system).

---

## PART J — COST

Current ≈ **$60/mo** (Pro + MEDIUM compute), rising because premium DB storage holds disposable logs.

Target: **bounded and cheaper.**
- Prune `whatsapp_webhook_events` → DB 1.16 GB → ~160 MB → **step off MEDIUM back toward MICRO/SMALL** once stable.
- Redis (Upstash) free/pay-as-you-go (~$0–10/mo).
- R2 ~ **$0.015/GB-month, $0 egress** — archives cost cents.
- Net: pay Postgres for the **hot working set only**; history lives on object storage at ~1/20th the cost. Growth no longer forces DB upgrades.

---

## PART K — PHASED MIGRATION PLAN (non-destructive, ordered by ROI)

**Phase 0 — Immediate safe win (hours):**
- Add pg_cron job: delete `whatsapp_webhook_events` older than 7 days; one-time backfill delete + `VACUUM FULL` (off-peak) → reclaim ~950 MB now.
- Provision `UPSTASH_*` env (activate the Redis already coded).

**Phase 1 — Audit hardening:** dashboards for per-table growth; drop confirmed-unused/bloated indexes; tune autovacuum.

**Phase 2 — Partitioning:** convert webhook_events, messages, campaign_recipients to monthly range partitions; switch deletion to partition-drop.

**Phase 3 — Redis offload:** move dedup/idempotency + hot caches (workspace settings, computed counts) to Redis with TTLs.

**Phase 4 — Object storage + archive pipeline:** R2 wiring; archive-before-delete workers.

**Phase 5 — Async export system:** export_job queue + signed URLs + expiry.

**Phase 6 — Campaign lifecycle:** lifecycle columns + notify → grace → archive → delete + audit; extend the existing (notify-only) retention into full automation.

**Phase 7 — Analytics rollups:** nightly aggregation; dashboards on aggregates.

**Phase 8 — Deletion workflows:** dependency-aware, legal-hold, admin override, full audit.

**Phase 9 — Monitoring/alerts:** thresholds + notifications.

**Phase 10 — Scale testing:** simulate 100/200/1,000 tenants; measure size, latency, cost.

---

## PART L — DIRECT ANSWERS TO THE 20 QUESTIONS

1. **Growth cause:** an unbounded raw webhook log (`whatsapp_webhook_events`), plus future campaign/message volume.
2. **Biggest storage:** `whatsapp_webhook_events` = 86% (1,003 MB / 704k rows); then vector_documents, campaign_recipients.
3. **Stays in PG:** T1 — tenants/users/workspaces/campaigns/contacts/config/billing + recent (≤90d) conversations/messages.
4. **To object storage:** exports, archived completed-campaign data, media, large reports.
5. **Archive:** completed-campaign messages/recipients past retention; old conversations.
6. **Auto-delete:** webhook/automation/usage logs, stale sessions, temp exports, rate-limit counters.
7. **Retention:** webhook 7d; logs 30d; messages/convos 90d; campaigns completed+90d (plan-configurable); exports 7–30d.
8. **Client workflow:** notify at retention → export (async→R2→signed URL) → 14d grace → archive/delete → audit.
9. **Campaign lifecycle:** lifecycle columns + state machine + dependency-aware deletion (partition drop for bulk).
10. **PG optimization:** partitioning, drop bloated/unused indexes, autovacuum tuning, keyset pagination, index-backed RLS.
11. **Partitioning:** yes — monthly range on webhook_events, messages, campaign_recipients (makes deletion instant).
12. **Redis:** cache, rate-limit (done), idempotency keys, job locks, transient state — all with TTL; already integrated, just provision.
13. **Workers:** pg-boss/QStash queue; idempotent, retryable, resumable jobs for archive/export/delete/cleanup/rollup.
14. **Large exports:** async job → batched write → R2 → signed URL → expiry. Never synchronous.
15. **Multi-tenant:** keep shared-DB + `workspace_id` + RLS; ensure RLS predicates indexed; DB-per-tenant only for compliance.
16. **Scale:** shared-DB + partitioning + lifecycle scales to ~1,000 tenants; read replica when reads degrade; shard beyond.
17. **Infra per stage:** see Part H table.
18. **Cost:** hot-set-only in PG, history in R2 ($0 egress); prune log to drop back to smaller compute; growth stops forcing upgrades.
19. **Monitoring:** size/growth/bloat/connections/latency/queue/jobs + threshold alerts at 70/85%.
20. **Final architecture:** Part E — Postgres (T1) + Redis (cache/queue) + R2 (archive/export/media) + async workers + analytics rollups, all lifecycle-automated.

---

## RECOMMENDED FIRST ACTION
**Phase 0.** One pg_cron prune of `whatsapp_webhook_events` (>7 days) + one-time reclaim removes ~86% of the database immediately and stops the bleed — with zero risk (server-only disposable log, RLS-denied, never read after processing). Everything else builds on that.
