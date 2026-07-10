# Design Spec: Session Limits & Lead Temperature Auto-Classification

**Date:** 2026-07-10  
**Status:** Approved  
**Scope:** Two independent features — (1) super_admin browser session limiting per workspace, (2) automatic lead temperature classification from message counts + keywords.

---

## Feature 1 — Workspace Super Admin Session Limitation

### Goal

Prevent a workspace's super_admin from logging in on more than N browsers/devices simultaneously. Agents and managers are **not** affected. N is configurable per workspace without code changes.

### Scope Boundary

- Applies **only** to users whose role in the workspace is `super_admin`
- `agent` and `manager` roles: completely unrestricted, no session tracking
- `admin` role: same as super_admin (conservative — both are privileged users)
- Default limit: **2** sessions; stored in `workspaces.settings.max_sessions` (JSONB, no column migration)

### Architecture

Two layers work together:

1. **`workspace_sessions` table** — application-level session tracker (independent of Supabase JWT)
2. **Dashboard layout gate** — server-side check on every dashboard page load

Supabase JWT handles *authentication* (identity). Our table handles *session counting* (which browsers are allowed).

### Database: `workspace_sessions` (migration 053)

```sql
workspace_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_token VARCHAR(64) NOT NULL UNIQUE,   -- random token stored in HttpOnly cookie
  user_agent    TEXT,                           -- browser/device info for admin UI
  ip_address    INET,                           -- optional, for audit
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ DEFAULT NOW(),      -- updated by 60s heartbeat
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
)

Indexes:
  (workspace_id, user_id) — for count queries
  (session_token)         — for per-request validation
  (expires_at)            — for cleanup job

RLS: USING (false) — only accessible via service-role admin client
```

### Session Lifecycle

#### A. Session creation (dashboard layout, first visit)

Triggered when a super_admin lands on any dashboard page without a valid `ws_session_token` cookie:

```
1. Count active sessions:
   SELECT COUNT(*) FROM workspace_sessions
   WHERE workspace_id = $ws AND user_id = $uid AND expires_at > NOW()

2a. count < max_sessions
    → generate session_token = crypto.randomBytes(32).toString('hex')
    → INSERT INTO workspace_sessions (atomic — embedded count guard prevents races)
    → set HttpOnly cookie 'ws_session_token' = token (SameSite=Lax, Secure, 30d)
    → continue to dashboard

2b. count >= max_sessions
    → supabase.auth.signOut()
    → clear any ws_session_token cookie
    → redirect('/login?error=session_limit')
```

**Race condition guard:** The INSERT uses a `WHERE (SELECT COUNT(...) < max_sessions)` subquery so two simultaneous tab opens from different browsers cannot both slip past a count of N−1.

#### B. Session validation (dashboard layout, every subsequent visit)

```
1. Read ws_session_token cookie
2. If absent  → go to (A) above
3. If present → SELECT id FROM workspace_sessions
                WHERE session_token = $token
                  AND user_id = $uid
                  AND workspace_id = $ws
                  AND expires_at > NOW()
4. Row found  → UPDATE last_seen_at = NOW() → continue
5. Row absent → session revoked or expired
                → supabase.auth.signOut()
                → redirect('/login?error=session_revoked')
```

#### C. Heartbeat (client, every 60 seconds)

`<SessionHeartbeat />` — a tiny `use client` component mounted in the dashboard layout. Calls `POST /api/session/heartbeat` which:
- Reads the cookie from the request
- Updates `last_seen_at = NOW()` and extends `expires_at = NOW() + 30 days` (sliding window)
- Returns 200 OK

If the tab is closed without logout, `expires_at` stops advancing. pg_cron cleans it up (see below).

#### D. Logout

Existing logout action extended to:
1. Read `ws_session_token` cookie
2. `DELETE FROM workspace_sessions WHERE session_token = $token`
3. Clear the cookie
4. `supabase.auth.signOut()` (existing)

#### E. Cleanup (pg_cron)

Added to existing `052_pg_cron_setup.sql` pattern:
```sql
SELECT cron.schedule('cleanup-expired-sessions', '0 * * * *',
  'DELETE FROM workspace_sessions WHERE expires_at < NOW()');
```
Runs hourly. Sessions idle > 30 days are purged automatically.

### Error Messages Shown to User

| Scenario | URL | Message shown |
|---|---|---|
| Limit hit on new browser | `/login?error=session_limit` | "This workspace is already active on 2 browsers. Please log out from another device first." |
| Admin revoked this session | `/login?error=session_revoked` | "Your session was revoked. Please log in again." |
| Session expired (idle 30d) | `/login?error=session_revoked` | same |

### Admin Session Management UI

New panel in **Settings → Workspace** (super_admin only):

**"Active Sessions"** card shows a table:
| Browser / Device | Logged in | Last active | IP | Actions |
|---|---|---|---|---|
| Chrome / Windows | 2h ago | 5 min ago | 103.x.x.x | Revoke |
| Safari / iPhone | 1d ago | 30 min ago | 49.x.x.x | Revoke |

- **Revoke** → `DELETE FROM workspace_sessions WHERE id = $row_id` — that browser is blocked on next page load
- **Revoke all other sessions** → deletes all rows except the current cookie's session

API route: `GET /api/session/list?workspaceId=` and `DELETE /api/session/[id]`

### Files Changed

| File | Action |
|---|---|
| `database/migrations/053_workspace_sessions.sql` | NEW — table + indexes + RLS + cleanup cron |
| `lib/session.ts` | NEW — helper: createSession, validateSession, deleteSession, countSessions |
| `app/(dashboard)/layout.tsx` | MODIFY — add session gate for super_admin/admin roles |
| `app/actions/auth.actions.ts` | MODIFY — extend logout to delete session row + clear cookie |
| `app/api/session/heartbeat/route.ts` | NEW — updates last_seen_at + extends expires_at |
| `app/api/session/list/route.ts` | NEW — GET list of active sessions (admin UI) |
| `app/api/session/[id]/route.ts` | NEW — DELETE to revoke a specific session |
| `components/SessionHeartbeat/index.tsx` | NEW — client component, pings every 60s |
| `app/(auth)/login/page.tsx` or login form | MODIFY — read `?error=session_limit` / `?error=session_revoked` and show message |
| `modules/settings/components/WorkspaceSettings/index.tsx` | MODIFY — add Active Sessions panel |

### Security Considerations

- `ws_session_token` is a 32-byte random hex string (256-bit entropy) — unguessable
- HttpOnly + Secure + SameSite=Lax — safe from XSS and CSRF
- RLS blocks direct client queries — only server-side admin client reads/writes this table
- Supabase JWT is NOT replaced — still required for identity; our token adds the session-count layer
- Duplicate tabs in the same browser share cookies → same session token → single session row (correct)
- Server restart safe — sessions survive in DB

---

## Feature 2 — Automatic Lead Temperature Auto-Classification

### Goal

Lead `temperature` (`cold`/`warm`/`hot`) updates automatically as conversation engagement grows. No manual tagging needed. Classification uses message count as the **baseline**, with keyword detection able to **upgrade** (never downgrade). This is "Option B" as agreed.

### What Already Exists (not changed)

- `leads.temperature VARCHAR(10)` column — already in production (migration 018)
- `detectLeadTemperature(messageContent)` in `lib/ai-reply.ts` — keyword-based, already correct (never downgrades); **left unchanged**
- `autoCreateOrUpdateLead()` in webhook — calls keyword detection, never downgrades; **left unchanged**

### What Changes

A new **PostgreSQL trigger** fires after every `messages` INSERT. It applies count-based temperature and never downgrades, composing cleanly with the existing keyword logic.

### Message Counting Rules

| sender_type | type | Counted? | Reason |
|---|---|---|---|
| `contact` | any (not internal_note) | ✅ | Real customer message |
| `agent` | any (not internal_note) | ✅ | Real human agent reply |
| `bot` | any | ❌ | Auto-reply noise |
| `campaign` | any | ❌ | One-way blast, not engagement |
| any | `internal_note` | ❌ | Team-only, not customer-facing |
| is_deleted = true | any | ❌ | Soft-deleted |

### Classification Thresholds

| Message count | Temperature |
|---|---|
| 0 – 3 | `cold` |
| 4 – 7 | `warm` |
| ≥ 8 | `hot` |

### How Option B Works (trigger + existing keyword logic)

Both run independently on each inbound message. Each only upgrades:

```
Inbound message arrives
  ↓
DB trigger fires (AFTER INSERT on messages):
  → count qualifying messages for this conversation
  → count_temp = cold/warm/hot
  → new_temp = max(count_temp, current_temp)  ← never downgrades
  → UPDATE leads SET temperature = new_temp

  (simultaneously, later in webhook handler...)
autoCreateOrUpdateLead() runs:
  → detectLeadTemperature(messageText) → keyword_temp
  → new_temp = max(keyword_temp, current_temp)  ← never downgrades
  → UPDATE leads SET temperature = new_temp
```

**Result examples:**

| Messages | Keywords in msg | Final temp | Why |
|---|---|---|---|
| 2 | none | cold | count=cold, no keyword |
| 2 | "order karna hai" | hot | keyword upgrades from cold |
| 5 | none | warm | count=warm |
| 5 | "price?" | warm | keyword=warm, no upgrade |
| 5 | "buy now" | hot | keyword=hot upgrades from warm |
| 9 | none | hot | count=hot |
| 9 | "baad mein dekhenge" | hot | cold keyword — no downgrade; count wins |

### Database: trigger functions (migration 054)

```sql
-- Pure SQL helpers (IMMUTABLE — zero overhead)
CREATE OR REPLACE FUNCTION classify_temp_by_count(v_count INTEGER)
RETURNS VARCHAR(10) LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v_count >= 8 THEN 'hot' WHEN v_count >= 4 THEN 'warm' ELSE 'cold' END
$$;

CREATE OR REPLACE FUNCTION temperature_rank(temp VARCHAR(10))
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE temp WHEN 'hot' THEN 2 WHEN 'warm' THEN 1 ELSE 0 END
$$;

-- Trigger function
CREATE OR REPLACE FUNCTION update_lead_temp_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead_id     UUID;
  v_current     VARCHAR(10);
  v_msg_count   INTEGER;
  v_count_temp  VARCHAR(10);
BEGIN
  -- Skip bot, campaign, internal notes, deleted
  IF NEW.sender_type NOT IN ('contact', 'agent') THEN RETURN NEW; END IF;
  IF NEW.type = 'internal_note' OR NEW.is_deleted THEN RETURN NEW; END IF;

  SELECT id, temperature INTO v_lead_id, v_current
  FROM leads WHERE conversation_id = NEW.conversation_id LIMIT 1;
  IF v_lead_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_msg_count
  FROM messages
  WHERE conversation_id = NEW.conversation_id
    AND sender_type IN ('contact', 'agent')
    AND (type IS NULL OR type != 'internal_note')
    AND is_deleted = false;

  v_count_temp := classify_temp_by_count(v_msg_count);

  IF temperature_rank(v_count_temp) > temperature_rank(v_current) THEN
    UPDATE leads SET temperature = v_count_temp, updated_at = NOW()
    WHERE id = v_lead_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lead_temp_on_message
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_lead_temp_on_message();
```

### Frontend Changes

#### 1. Temperature badge colours (wherever lead cards render)

Standardise across `LeadCard`, `LeadDetail`, and any table row that shows temperature:

| Value | Badge style |
|---|---|
| `cold` | Blue — `bg-blue-100 text-blue-700` |
| `warm` | Amber — `bg-amber-100 text-amber-700` |
| `hot` | Red — `bg-red-100 text-red-700` |

#### 2. Temperature filter in CRM board

Add filter chips to the CRM Kanban board header: **All · Cold · Warm · Hot**

Clicking a chip filters the lead cards client-side (no new API needed — Supabase realtime already delivers all leads, filter is in-memory).

#### 3. No new API routes needed

The trigger updates `leads.temperature` directly in the DB. The existing Supabase realtime subscription on the leads table delivers the update to the CRM board automatically.

### Files Changed

| File | Action |
|---|---|
| `database/migrations/054_lead_temp_trigger.sql` | NEW — helper functions + trigger |
| `modules/crm/components/KanbanBoard/index.tsx` | MODIFY — add temperature filter chips |
| `modules/crm/components/LeadCard/index.tsx` | MODIFY — standardise temperature badge colours |
| `modules/crm/components/LeadDetail/index.tsx` | MODIFY — standardise temperature badge |

---

## Edge Cases & Failure Scenarios

### Session Limit (Feature 1)

| Scenario | Handling |
|---|---|
| Browser crashes without logout | Heartbeat stops → expires_at passes → pg_cron deletes → slot freed |
| Server restart | Sessions survive in DB — no state lost |
| Admin revokes session while user is active | On next page load, validation fails → redirect to login |
| User with 2 sessions logs out of one → third browser tries | Slot freed immediately on logout → third browser succeeds |
| workspace.settings.max_sessions not set | Default = 2 (hardcoded fallback in lib/session.ts) |
| Non-super_admin user | Entire session gate is skipped — no DB queries |
| Multi-workspace user selects different workspace | Session is tied to workspace_id — separate check per workspace |

### Lead Temperature (Feature 2)

| Scenario | Handling |
|---|---|
| Lead deleted then re-created | Trigger finds no lead → skips silently (RETURN NEW) |
| Conversation has no linked lead | Trigger skips silently |
| Message soft-deleted (is_deleted=true) | Not counted — temperature may only decrease naturally over time (count re-run would reduce it, but we never downgrade so it stays) |
| Two messages inserted in rapid succession | Both trigger fires run; second finds updated temperature; idempotent |
| Agent replies from dashboard (not webhook) | Trigger fires on all message INSERTs regardless of origin — agent replies count ✅ |

---

## Performance Impact

### Feature 1 (Sessions)

- One extra SELECT + conditional INSERT per dashboard page load for super_admin users only
- One UPDATE per 60s heartbeat (single row, PK lookup)
- Zero impact for agents/managers (gate is skipped)
- Cleanup: batch DELETE once per hour, indexed on expires_at — sub-millisecond at expected scale (<10k session rows ever)

### Feature 2 (Lead Trigger)

- Trigger fires on EVERY message INSERT workspace-wide
- Each execution: 1 SELECT (leads by conversation_id) + 1 COUNT query + conditional UPDATE
- Both queries are on indexed columns (`conversation_id`, `is_deleted`) — O(log n)
- At 100 messages/second (very high scale), this adds ~2-5ms per INSERT — acceptable
- The COUNT query is the heaviest; can be optimised later with a `message_count` denormalised column if needed (not required now)

---

## Implementation Order

1. **Migration 053** — workspace_sessions table (no app changes yet, safe to run first)
2. **`lib/session.ts`** — helper functions
3. **`app/(dashboard)/layout.tsx`** — session gate
4. **Login page** — session_limit error message
5. **Heartbeat** — component + API route
6. **Logout** — extend to delete session
7. **Session management UI** — Settings → Workspace
8. **Migration 054** — lead temp trigger (safe to run independently)
9. **CRM frontend** — badge colours + temperature filter chips
