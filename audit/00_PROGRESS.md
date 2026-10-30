# Launch Audit — Progress

Branch: `launch-audit` (created 2026-10-30 from `main` @ 95f6e67)
Status: **HALTED at Phase 0, step 0 (A1 safety stop)** — waiting on owner.

## Phase checklist
- [ ] Phase 0: Discovery, system map, test harness ← **blocked: no isolated test DB (see below)**
- [ ] Phase 1: Functional E2E of every feature
- [ ] Phase 2: Security audit
- [ ] Phase 3: Privacy & compliance
- [ ] Phase 4: Performance / scalability / load
- [ ] Phase 5: UX pass
- [ ] Phase 6: Consolidated audit report
- [ ] Phase 7: Independent verification
- [ ] Phase 8: Fix plan (CHECKPOINT, wait for "GO" unless AUTONOMOUS)
- [ ] Phase 9: Execute fixes
- [ ] Phase 10: Regression & re-verification
- [ ] Phase 11: Launch gate & verdict
- [ ] Phase 12: Launch dossier

## Done
- Created branch `launch-audit` and `audit/`, `audit/evidence/`.
- A1 environment check (below).

## A1 safety stop: findings
| Check | Result |
|---|---|
| `.env.local` `NEXT_PUBLIC_SUPABASE_URL` | production project `yvqaproltcskufufmomi` |
| `.env.local` `SUPABASE_DB_URL` | the same production project, via the ap-south-1 pooler |
| `.env.local` `NEXT_PUBLIC_APP_URL` | `https://app.aiagentixdev.com` (production) |
| `.env.local` also holds | `[REDACTED: SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, RAZORPAY_WEBHOOK_SECRET, CRON_SECRET, SMTP_PASS, RESEND_API_KEY, UPSTASH_REDIS_REST_TOKEN in .env.local]`, presumed live |
| Local isolated DB possible? | **No**: no Docker, no `psql`/Postgres, no Supabase CLI installed |
| Known prior issue | a DB password is committed in `run-migration.mjs` (owner memory); will be re-verified in Phase 2 secrets scan |

Per A1.1, nothing has been run against this environment. Nothing executable (dev server, seed, tests that hit the DB, load tests, IDOR matrix) can run until a separate test database exists.

## What can proceed without a test DB (CODE-REVIEW-ONLY)
System map, feature/API inventories, permissions matrix, PII map, fake-feature sweep, static security review (semgrep, gitleaks on history, npm audit), privacy review, architecture-for-scale review. These are read-only on the code, and every result would be tagged `CODE-REVIEW-ONLY`.

## Questions for owner (blocking)
1. **Test database.** Pick one:
   a. Install Docker Desktop, then run `npx supabase start` locally. I apply the `database/migrations` (138 files) to it. *(Recommended: free, isolated, fully resettable.)*
   b. Create a separate **staging** Supabase project (free tier) and put its URL and keys in a new `.env.audit` file. The production `.env.local` stays untouched.
2. May I do the static (CODE-REVIEW-ONLY) parts of Phases 0–4 now, while the test DB is being set up?
3. Is there a staging URL, test logins, or a test WABA/number? (These were left blank in the prompt.)
4. Is this run AUTONOMOUS (skip the Phase 8 checkpoint)?

## Assumptions
- None acted on yet.

## Tools installed
- None yet. Present: vitest, playwright (in node_modules). Missing: docker, psql, supabase CLI, k6, semgrep, gitleaks, osv-scanner.
