# Session Limits & Lead Temperature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Prevent super_admin/admin users from opening more than N browser sessions simultaneously; (2) Auto-update lead temperature (cold/warm/hot) from message count, with keyword detection still able to upgrade but never downgrade.

**Architecture:**
Feature 1 adds an application-layer `workspace_sessions` table. The Next.js dashboard layout validates a custom HttpOnly cookie against this table on every page load; a `/api/session/init` route handler sets the cookie (since Server Components cannot write cookies directly). A client-side heartbeat extends expiry every 60 s. Feature 2 is a PostgreSQL `AFTER INSERT ON messages` trigger that counts qualifying messages, classifies the linked lead as cold/warm/hot, and never downgrades. The KanbanBoard temperature filter and LeadCard badges already exist — zero frontend work needed for Feature 2.

**Tech Stack:** Next.js 14 App Router, Supabase (admin client bypasses RLS), PostgreSQL triggers, `next/headers` cookies, `crypto.randomBytes`, React `useEffect` for heartbeat.

## Global Constraints

- All Supabase DB writes use `createAdminClient()` (service-role key) — RLS bypassed server-side only.
- Cookie name: `ws_session_token` — HttpOnly, Secure in production, SameSite=Lax.
- `max_sessions` is read from `workspaces.settings.max_sessions` (JSONB). `null` or absent = unlimited (skip gate entirely).
- Default limit when `max_sessions` is set: value from DB (Razorveda will have `2`).
- Gate applies to roles `super_admin` and `admin` only. `manager` and `agent` bypass all session checks.
- Session expiry: 30 days sliding window (extended on each heartbeat).
- Lead temp thresholds: `< 4` qualifying messages → `cold`; `4–7` → `warm`; `≥ 8` → `hot`.
- Qualifying messages: `sender_type IN ('contact', 'agent')` AND `type != 'internal_note'` AND `is_deleted = false`.
- Never downgrade temperature — both trigger and keyword detection use `max(new, current)` logic.
- TypeScript: `npx tsc --noEmit` must pass after every task.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `database/migrations/053_workspace_sessions.sql` | **CREATE** | Table, indexes, RLS, pg_cron cleanup |
| `database/migrations/054_lead_temp_trigger.sql` | **CREATE** | Helper SQL functions + AFTER INSERT trigger |
| `lib/session.ts` | **CREATE** | countActiveSessions, createSession, validateSession, deleteSession, deleteAllSessions |
| `app/api/session/init/route.ts` | **CREATE** | GET — reads token from query param, sets HttpOnly cookie, redirects |
| `app/api/session/heartbeat/route.ts` | **CREATE** | POST — refreshes last_seen_at + extends expires_at |
| `app/api/session/list/route.ts` | **CREATE** | GET — lists active sessions for workspace+user (admin UI) |
| `app/api/session/[id]/route.ts` | **CREATE** | DELETE — revoke a specific session |
| `components/SessionHeartbeat/index.tsx` | **CREATE** | Client component, pings heartbeat every 60 s |
| `app/(auth)/session-limit/page.tsx` | **CREATE** | Blocked user landing page with Try Again + Log Out |
| `app/(dashboard)/layout.tsx` | **MODIFY** | Add session gate block after workspace checks |
| `app/actions/auth.actions.ts` | **MODIFY** | signOutAction: delete session row before Supabase sign-out |
| `components/layout/AppShell/index.tsx` | **MODIFY** | Mount `<SessionHeartbeat />` |
| `modules/settings/components/WorkspaceSettings/index.tsx` | **MODIFY** | Add Active Sessions panel |

---

## Task 1: DB Migration — `workspace_sessions` table

**Files:**
- Create: `database/migrations/053_workspace_sessions.sql`

**Interfaces:**
- Produces: table `workspace_sessions(id, workspace_id, user_id, session_token, user_agent, ip_address, created_at, last_seen_at, expires_at)` accessible only via service-role client.

- [ ] **Step 1: Write the migration file**

```sql
-- 053_workspace_sessions.sql
-- Application-level session tracker for super_admin/admin role limiting.
-- Supabase JWT handles identity; this table handles "how many browsers are allowed."
-- RLS is set to USING (false) — only the server-side admin client (service-role key) reads/writes this table.

CREATE TABLE IF NOT EXISTS public.workspace_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES public.workspaces(id)  ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES public.profiles(id)     ON DELETE CASCADE,
  session_token VARCHAR(64) NOT NULL UNIQUE,
  user_agent    TEXT,
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_ws_sessions_workspace_user
  ON public.workspace_sessions (workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_ws_sessions_token
  ON public.workspace_sessions (session_token);

CREATE INDEX IF NOT EXISTS idx_ws_sessions_expires
  ON public.workspace_sessions (expires_at);

ALTER TABLE public.workspace_sessions ENABLE ROW LEVEL SECURITY;

-- Block all direct client access — only service-role (admin) client may access this table.
CREATE POLICY "sessions_deny_all_client_access"
  ON public.workspace_sessions
  FOR ALL
  USING (false);

-- pg_cron: clean up expired sessions every hour.
-- Requires pg_cron extension already enabled (migration 052).
SELECT cron.unschedule('cleanup-expired-sessions')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-sessions');

SELECT cron.schedule(
  'cleanup-expired-sessions',
  '0 * * * *',
  'DELETE FROM public.workspace_sessions WHERE expires_at < NOW()'
);
```

- [ ] **Step 2: Run in Supabase SQL editor**

Paste the file into the Supabase SQL editor and execute. Verify:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'workspace_sessions'
ORDER BY ordinal_position;
-- Expected: id, workspace_id, user_id, session_token, user_agent, ip_address,
--           created_at, last_seen_at, expires_at
```

- [ ] **Step 3: Commit**

```bash
git add database/migrations/053_workspace_sessions.sql
git commit -m "feat(session): add workspace_sessions table with RLS + pg_cron cleanup"
```

---

## Task 2: Session Helper Library

**Files:**
- Create: `lib/session.ts`

**Interfaces:**
- Produces:
  - `countActiveSessions(workspaceId: string, userId: string): Promise<number>`
  - `createSession(workspaceId: string, userId: string, userAgent: string, maxSessions: number): Promise<string | null>` — returns token string or `null` if limit hit
  - `validateSession(token: string, workspaceId: string, userId: string): Promise<boolean>`
  - `deleteSession(token: string): Promise<void>`
  - `deleteAllSessions(workspaceId: string, userId: string): Promise<void>`
  - `SESSION_COOKIE_NAME: string` — `'ws_session_token'`
  - `SESSION_COOKIE_OPTIONS: object` — shared cookie config

- [ ] **Step 1: Create `lib/session.ts`**

```typescript
import { randomBytes } from 'crypto';
import { createAdminClient } from '@/services/supabase/admin';

export const SESSION_COOKIE_NAME = 'ws_session_token';
const EXPIRY_DAYS = 30;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly:  true,
  secure:    process.env.NODE_ENV === 'production',
  sameSite:  'lax'  as const,
  maxAge:    EXPIRY_DAYS * 86400,
  path:      '/',
};

function expiresAt(): string {
  return new Date(Date.now() + EXPIRY_DAYS * 86400 * 1000).toISOString();
}

export async function countActiveSessions(
  workspaceId: string,
  userId:      string,
): Promise<number> {
  const db = createAdminClient() as any;
  const { count } = await db
    .from('workspace_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('user_id',      userId)
    .gt('expires_at',   new Date().toISOString());
  return count ?? 0;
}

/** Returns the new session token, or null if the limit is already reached. */
export async function createSession(
  workspaceId: string,
  userId:      string,
  userAgent:   string,
  maxSessions: number,
): Promise<string | null> {
  const current = await countActiveSessions(workspaceId, userId);
  if (current >= maxSessions) return null;

  const token = randomBytes(32).toString('hex');
  const db    = createAdminClient() as any;
  const { error } = await db.from('workspace_sessions').insert({
    workspace_id:  workspaceId,
    user_id:       userId,
    session_token: token,
    user_agent:    userAgent.slice(0, 512),
    expires_at:    expiresAt(),
  });
  if (error) return null;
  return token;
}

/** Returns true if the token is valid (exists, matches user/workspace, not expired). */
export async function validateSession(
  token:       string,
  workspaceId: string,
  userId:      string,
): Promise<boolean> {
  const db = createAdminClient() as any;
  const { data } = await db
    .from('workspace_sessions')
    .select('id')
    .eq('session_token', token)
    .eq('workspace_id',  workspaceId)
    .eq('user_id',       userId)
    .gt('expires_at',    new Date().toISOString())
    .maybeSingle();
  return !!data;
}

/** Extends the session's expiry by EXPIRY_DAYS from now (sliding window). */
export async function refreshSession(token: string): Promise<void> {
  const db = createAdminClient() as any;
  await db
    .from('workspace_sessions')
    .update({ last_seen_at: new Date().toISOString(), expires_at: expiresAt() })
    .eq('session_token', token);
}

/** Deletes a single session by token. Called on logout. */
export async function deleteSession(token: string): Promise<void> {
  const db = createAdminClient() as any;
  await db.from('workspace_sessions').delete().eq('session_token', token);
}

/** Deletes ALL sessions for this user in this workspace. Used by "revoke all" admin action. */
export async function deleteAllSessions(
  workspaceId: string,
  userId:      string,
): Promise<void> {
  const db = createAdminClient() as any;
  await db
    .from('workspace_sessions')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id',      userId);
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors related to `lib/session.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/session.ts
git commit -m "feat(session): add session helpers (create, validate, delete, count)"
```

---

## Task 3: Cookie-Init Route

Server Components cannot write cookies. This route is the one-stop cookie-setter: the dashboard layout redirects here (with the token in the URL query), this route sets the cookie in the HTTP response, then redirects the user to `/conversations`.

**Files:**
- Create: `app/api/session/init/route.ts`

**Interfaces:**
- Consumes: `GET /api/session/init?t=<token>&next=<encoded-path>`
- Produces: HttpOnly `ws_session_token` cookie set in response, then `302` redirect to `next`.

- [ ] **Step 1: Create the route**

```typescript
// app/api/session/init/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/session';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t');
  const next  = request.nextUrl.searchParams.get('next') ?? '/conversations';

  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.redirect(new URL('/conversations', request.url));
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
  return response;
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/session/init/route.ts
git commit -m "feat(session): add /api/session/init cookie-set redirect route"
```

---

## Task 4: Dashboard Layout — Session Gate

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `SESSION_COOKIE_NAME`, `createSession`, `validateSession` from `lib/session.ts`
- Produces: for privileged users with `max_sessions` set, blocks or creates a session before rendering children.

- [ ] **Step 1: Add the session gate block to layout.tsx**

Open `app/(dashboard)/layout.tsx`. After the existing workspace active-check block (after line 70, before `return (`), add the import and gate. The full updated file:

```typescript
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { AppShell } from '@/components/layout/AppShell';
import { StoreInitializer } from '@/components/StoreInitializer';
import { getUser } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { getProfile } from '@/modules/auth/services/profile.service';
import { createAdminClient } from '@/services/supabase/admin';
import { ROUTES } from '@/lib/constants';
import {
  SESSION_COOKIE_NAME,
  createSession,
  validateSession,
} from '@/lib/session';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const user = await getUser();
  if (!user) redirect(ROUTES.LOGIN);

  const db = createAdminClient() as any;

  // Platform admins always go to /admin
  const { data: adminCheck } = await db
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();
  if (adminCheck?.is_platform_admin) redirect('/admin');

  const [workspaces, profile] = await Promise.all([
    getUserWorkspaces(user.id),
    getProfile(user.id),
  ]);
  if (workspaces.length === 0) redirect(ROUTES.WORKSPACE_NEW);

  const initUser = {
    id:         user.id,
    email:      user.email ?? '',
    full_name:  profile?.full_name ?? (user.user_metadata['full_name'] as string | undefined) ?? '',
    avatar_url: profile?.avatar_url ?? (user.user_metadata['avatar_url'] as string | undefined) ?? null,
  };

  const cookieStore  = await cookies();
  const preferredId  = cookieStore.get('active_workspace_id')?.value;
  const preferredWs  = preferredId ? workspaces.find((w) => w.id === preferredId) : undefined;
  const activeWorkspace = preferredWs ?? workspaces[0]!;

  // Fetch workspace status fields in a single query
  const { data: ws } = await db
    .from('workspaces')
    .select('onboarding_complete, is_active, subscription_status, settings')
    .eq('id', activeWorkspace.id)
    .single();

  if (ws?.onboarding_complete === false) redirect('/onboarding');
  if (ws?.is_active === false) {
    redirect(ws?.subscription_status === 'pending_approval'
      ? '/pending-approval'
      : '/payment-required');
  }

  // ── Session Gate (super_admin / admin only) ───────────────────────────────
  // max_sessions stored in workspaces.settings.max_sessions.
  // null or absent = unlimited → skip gate entirely.
  const maxSessions = (ws?.settings as Record<string, unknown> | null)?.max_sessions;
  const role        = (activeWorkspace as any).role as string | undefined;
  const isPrivileged = role === 'super_admin' || role === 'admin';

  if (isPrivileged && typeof maxSessions === 'number') {
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
      const valid = await validateSession(token, activeWorkspace.id, user.id);
      if (!valid) {
        // Session was revoked or expired — tell user on a dedicated page
        redirect('/session-limit?reason=revoked');
      }
      // Valid session — let through (heartbeat handles last_seen_at update)
    } else {
      // No session cookie — try to create a new session slot
      const headerStore = await headers();
      const userAgent   = headerStore.get('user-agent') ?? 'Unknown';
      const newToken    = await createSession(
        activeWorkspace.id,
        user.id,
        userAgent,
        maxSessions,
      );
      if (!newToken) {
        // Limit already hit on another device
        redirect('/session-limit?reason=limit');
      }
      // Redirect to cookie-setter (Server Components cannot write cookies directly)
      const encodedNext = encodeURIComponent('/conversations');
      redirect(`/api/session/init?t=${newToken}&next=${encodedNext}`);
    }
  }
  // ── End Session Gate ──────────────────────────────────────────────────────

  return (
    <AppShell>
      <StoreInitializer user={initUser} workspace={activeWorkspace} />
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Manual smoke test** (no sessions active)

With no `max_sessions` set in any workspace, load `/conversations`. It should render normally — the gate is skipped.

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/layout.tsx
git commit -m "feat(session): add session gate in dashboard layout for super_admin/admin"
```

---

## Task 5: Session Limit Page

**Files:**
- Create: `app/(auth)/session-limit/page.tsx`

This page is in the `(auth)` group so it does NOT go through the dashboard layout — no infinite loop.

**Interfaces:**
- Reads: `?reason=limit` | `?reason=revoked` from URL.
- Produces: user-facing page with Try Again + Log Out actions.

- [ ] **Step 1: Create the page**

```typescript
// app/(auth)/session-limit/page.tsx
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { SessionLimitActions } from './SessionLimitActions';

interface Props {
  searchParams: Promise<{ reason?: string }>;
}

export default async function SessionLimitPage({ searchParams }: Props) {
  const { reason } = await searchParams;
  const isRevoked = reason === 'revoked';

  return (
    <AuthCard
      title={isRevoked ? 'Session ended' : 'Too many active sessions'}
      subtitle={
        isRevoked
          ? 'Your session was ended by an administrator or expired.'
          : 'This workspace is already open on the maximum number of browsers.'
      }
    >
      <p className="text-sm text-muted-foreground">
        {isRevoked
          ? 'Please log in again to continue.'
          : 'Log out from another browser or device, then try again.'}
      </p>
      <SessionLimitActions isRevoked={isRevoked} />
    </AuthCard>
  );
}
```

- [ ] **Step 2: Create `SessionLimitActions` client component**

```typescript
// app/(auth)/session-limit/SessionLimitActions.tsx
'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/app/actions/auth.actions';

interface Props {
  isRevoked: boolean;
}

export function SessionLimitActions({ isRevoked }: Props) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2 mt-4">
      {!isRevoked && (
        <Button
          variant="default"
          className="w-full"
          onClick={() => router.push('/conversations')}
        >
          Try again
        </Button>
      )}
      <form action={signOutAction}>
        <Button type="submit" variant="outline" className="w-full">
          Log out
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/session-limit/"
git commit -m "feat(session): add session-limit page for blocked/revoked sessions"
```

---

## Task 6: Heartbeat — API Route + Client Component

**Files:**
- Create: `app/api/session/heartbeat/route.ts`
- Create: `components/SessionHeartbeat/index.tsx`
- Modify: `components/layout/AppShell/index.tsx`

**Interfaces:**
- `POST /api/session/heartbeat` — reads `ws_session_token` cookie, calls `refreshSession(token)`, returns `200`.
- `<SessionHeartbeat />` — mounts in AppShell, fires every 60 000 ms.

- [ ] **Step 1: Create heartbeat API route**

```typescript
// app/api/session/heartbeat/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, refreshSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await refreshSession(token);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create `<SessionHeartbeat />` client component**

```typescript
// components/SessionHeartbeat/index.tsx
'use client';

import { useEffect } from 'react';

const INTERVAL_MS = 60_000; // 60 seconds

export function SessionHeartbeat() {
  useEffect(() => {
    const ping = () => fetch('/api/session/heartbeat', { method: 'POST' }).catch(() => {});
    ping(); // ping immediately on mount
    const id = setInterval(ping, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
```

- [ ] **Step 3: Mount `<SessionHeartbeat />` in AppShell**

Edit `components/layout/AppShell/index.tsx`:

```typescript
'use client';

import { useNotifications } from '@/hooks/useNotifications';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { MobileNav } from '@/components/layout/MobileNav';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { PageTransition } from '@/components/layout/PageTransition';
import { SessionHeartbeat } from '@/components/SessionHeartbeat';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  useNotifications();

  return (
    <div className="flex h-screen overflow-hidden bg-surface-secondary">
      <SessionHeartbeat />

      <div className="hidden md:flex md:shrink-0">
        <Sidebar />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className={cn('flex-1 overflow-auto', 'pb-16 md:pb-0')}>
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <MobileNav />
      <CommandPalette />
    </div>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/session/heartbeat/route.ts components/SessionHeartbeat/index.tsx components/layout/AppShell/index.tsx
git commit -m "feat(session): add heartbeat route + client component, mount in AppShell"
```

---

## Task 7: Logout Session Cleanup

**Files:**
- Modify: `app/actions/auth.actions.ts`

When a user logs out, delete their session token so the slot is freed immediately for another device.

**Interfaces:**
- Consumes: `SESSION_COOKIE_NAME`, `deleteSession` from `lib/session.ts`.
- Modifies: `signOutAction()` — adds session deletion before Supabase sign-out.

- [ ] **Step 1: Update `signOutAction` in `app/actions/auth.actions.ts`**

Replace the existing `signOutAction`:

```typescript
export async function signOutAction(): Promise<void> {
  // Delete application-layer session so the slot is freed immediately
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const { deleteSession } = await import('@/lib/session');
    await deleteSession(token);
    cookieStore.delete(SESSION_COOKIE_NAME);
  }

  await signOut();
  revalidatePath('/', 'layout');
  redirect(ROUTES.LOGIN);
}
```

Also add the import at the top of the file:

```typescript
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/session';
```

The full updated `app/actions/auth.actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { loginSchema, signupSchema, forgotPasswordSchema } from '@/modules/auth/types';
import {
  signInWithPassword,
  signUp,
  signOut,
  resetPasswordForEmail,
} from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { ROUTES } from '@/lib/constants';
import { SESSION_COOKIE_NAME } from '@/lib/session';
import type { AuthActionResult } from '@/modules/auth/types';

export async function loginAction(
  _prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const raw = { email: formData.get('email'), password: formData.get('password') };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  let { user, error } = await signInWithPassword(parsed.data.email, parsed.data.password);

  if (!user && error === 'Please verify your email before signing in.') {
    try {
      const { createAdminClient } = await import('@/services/supabase/admin');
      const adminDb = createAdminClient();
      const { data: list } = await adminDb.auth.admin.listUsers();
      const found = list?.users?.find((u: { email?: string }) => u.email === parsed.data.email);
      if (found) {
        await adminDb.auth.admin.updateUserById(found.id, { email_confirm: true });
        const retry = await signInWithPassword(parsed.data.email, parsed.data.password);
        user = retry.user;
        error = retry.error;
      }
    } catch { /* non-fatal */ }
  }

  if (error || !user) return { success: false, error: error ?? 'Sign in failed.' };

  const workspaces = await getUserWorkspaces(user.id);

  revalidatePath('/', 'layout');

  if (workspaces.length === 0)  return { success: true, redirectTo: ROUTES.WORKSPACE_NEW };
  if (workspaces.length === 1)  return { success: true, redirectTo: ROUTES.DASHBOARD };
  return { success: true, redirectTo: ROUTES.WORKSPACE_SELECT };
}

export async function signupAction(
  _prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const raw = {
    full_name:        formData.get('full_name'),
    email:            formData.get('email'),
    password:         formData.get('password'),
    confirm_password: formData.get('confirm_password'),
  };
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { user, error } = await signUp(
    parsed.data.email,
    parsed.data.password,
    parsed.data.full_name,
  );
  if (error || !user) return { success: false, error: error ?? 'Sign up failed.' };

  await signInWithPassword(parsed.data.email, parsed.data.password);

  revalidatePath('/', 'layout');
  return { success: true, redirectTo: ROUTES.WORKSPACE_NEW };
}

export async function forgotPasswordAction(
  _prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const raw = { email: formData.get('email') };
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: 'Enter a valid email address.' };

  const { error } = await resetPasswordForEmail(parsed.data.email);
  if (error) return { success: false, error };
  return { success: true };
}

export async function signOutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const { deleteSession } = await import('@/lib/session');
    await deleteSession(token);
    cookieStore.delete(SESSION_COOKIE_NAME);
  }

  await signOut();
  revalidatePath('/', 'layout');
  redirect(ROUTES.LOGIN);
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/actions/auth.actions.ts
git commit -m "feat(session): delete session row on logout to free slot immediately"
```

---

## Task 8: Session Management API Routes

**Files:**
- Create: `app/api/session/list/route.ts`
- Create: `app/api/session/[id]/route.ts`

**Interfaces:**
- `GET /api/session/list?workspaceId=` → `{ sessions: SessionRow[] }` where `SessionRow = { id, user_agent, ip_address, created_at, last_seen_at, isCurrent: boolean }`
- `DELETE /api/session/[id]?workspaceId=` → `{ ok: true }` — revokes a session by row ID.

- [ ] **Step 1: Create list route**

```typescript
// app/api/session/list/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { createAdminClient } from '@/services/supabase/admin';
import { SESSION_COOKIE_NAME } from '@/lib/session';
import { getUser } from '@/modules/auth/services/auth.service';

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createAdminClient() as any;
    const { data: sessions, error } = await db
      .from('workspace_sessions')
      .select('id, user_agent, ip_address, created_at, last_seen_at, session_token')
      .eq('workspace_id', workspaceId)
      .eq('user_id',      user.id)
      .gt('expires_at',   new Date().toISOString())
      .order('last_seen_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const currentToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    return NextResponse.json({
      sessions: (sessions ?? []).map((s: any) => ({
        id:           s.id,
        user_agent:   s.user_agent,
        ip_address:   s.ip_address,
        created_at:   s.created_at,
        last_seen_at: s.last_seen_at,
        isCurrent:    s.session_token === currentToken,
      })),
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create revoke route**

```typescript
// app/api/session/[id]/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { createAdminClient } from '@/services/supabase/admin';
import { getUser } from '@/modules/auth/services/auth.service';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const db = createAdminClient() as any;

    // Only allow revoking own sessions (workspace_id + user_id guard prevents cross-user attacks)
    const { error } = await db
      .from('workspace_sessions')
      .delete()
      .eq('id',           id)
      .eq('workspace_id', workspaceId)
      .eq('user_id',      user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/api/session/list/route.ts "app/api/session/[id]/route.ts"
git commit -m "feat(session): add list + revoke API routes for session management UI"
```

---

## Task 9: Active Sessions UI in WorkspaceSettings

**Files:**
- Modify: `modules/settings/components/WorkspaceSettings/index.tsx`

Adds an "Active Sessions" panel below the existing workspace name form. Shows all active sessions with a Revoke button. Only shown to super_admin/admin.

**Interfaces:**
- Consumes: `GET /api/session/list?workspaceId=`, `DELETE /api/session/<id>?workspaceId=`
- The `useWorkspaceStore` already provides `activeWorkspace?.id` and the current member role is in `activeWorkspace.role` (from `WorkspaceWithRole`).

- [ ] **Step 1: Replace `modules/settings/components/WorkspaceSettings/index.tsx`**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useWorkspaceStore } from '@/store/workspace.store';
import { createClient } from '@/services/supabase/client';
import { toast } from 'sonner';
import { Monitor, Smartphone, Trash2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const schema = z.object({
  name: z.string().min(2).max(100),
});
type FormValues = z.infer<typeof schema>;

interface SessionRow {
  id:           string;
  user_agent:   string | null;
  ip_address:   string | null;
  created_at:   string;
  last_seen_at: string;
  isCurrent:    boolean;
}

function friendlyAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  if (/mobile|android|iphone|ipad/i.test(ua)) return 'Mobile browser';
  if (/chrome/i.test(ua))  return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua))  return 'Safari';
  if (/edge/i.test(ua))    return 'Edge';
  return 'Browser';
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ActiveSessions({ workspaceId }: { workspaceId: string }) {
  const [sessions,  setSessions]  = useState<SessionRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [revoking,  setRevoking]  = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/session/list?workspaceId=${workspaceId}`);
      const d = await r.json() as { sessions?: SessionRow[]; error?: string };
      if (r.ok) setSessions(d.sessions ?? []);
      else toast.error(d.error ?? 'Failed to load sessions');
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void fetchSessions(); }, [fetchSessions]);

  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      const r = await fetch(`/api/session/${id}?workspaceId=${workspaceId}`, { method: 'DELETE' });
      if (r.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        toast.success('Session revoked');
      } else {
        const d = await r.json() as { error?: string };
        toast.error(d.error ?? 'Failed to revoke');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {sessions.length === 0 && !loading ? 'No active sessions found.' : `${sessions.length} active session(s)`}
        </p>
        <button
          onClick={fetchSessions}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const isMobile = /mobile|android|iphone|ipad/i.test(s.user_agent ?? '');
            const DeviceIcon = isMobile ? Smartphone : Monitor;
            return (
              <div
                key={s.id}
                className={cn(
                  'flex items-center justify-between rounded-lg border border-border p-3',
                  s.isCurrent && 'border-brand-300 bg-brand-50/40 dark:bg-brand-900/10',
                )}
              >
                <div className="flex items-center gap-3">
                  <DeviceIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {friendlyAgent(s.user_agent)}
                      {s.isCurrent && (
                        <span className="ml-2 text-[10px] font-semibold text-brand-600 bg-brand-100 px-1.5 py-0.5 rounded">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Active {timeAgo(s.last_seen_at)}
                      {s.ip_address ? ` · ${s.ip_address}` : ''}
                    </p>
                  </div>
                </div>
                {!s.isCurrent && (
                  <button
                    onClick={() => revoke(s.id)}
                    disabled={revoking === s.id}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    {revoking === s.id ? 'Revoking…' : 'Revoke'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function WorkspaceSettings() {
  const workspace        = useWorkspaceStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const role             = (workspace as any)?.role as string | undefined;
  const isPrivileged     = role === 'super_admin' || role === 'admin';

  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { name: workspace?.name ?? '' },
    });

  const onSubmit = async (values: FormValues) => {
    if (!workspace) return;
    const supabase = createClient() as any;
    const { error } = await supabase
      .from('workspaces')
      .update({ name: values.name })
      .eq('id', workspace.id);
    if (error) {
      toast.error('Failed to update workspace');
    } else {
      setActiveWorkspace({ ...workspace, name: values.name });
      toast.success('Workspace updated');
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-foreground">Workspace</h2>
        <p className="text-sm text-muted-foreground">Update your workspace name and details.</p>
      </div>
      <Separator />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ws-name">Workspace Name</Label>
          <Input id="ws-name" {...register('name')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>URL Slug</Label>
          <Input value={workspace?.slug ?? ''} disabled className="bg-muted font-mono text-sm" />
          <p className="text-xs text-muted-foreground">Slug cannot be changed after creation.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Plan</Label>
          <Input value={workspace?.plan ?? 'starter'} disabled className="bg-muted text-sm capitalize" />
        </div>
        <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? 'Saving…' : 'Save Changes'}
        </Button>
      </form>

      {isPrivileged && workspace && (
        <>
          <Separator />
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Active Sessions</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                These are the browsers/devices currently logged into this workspace.
              </p>
            </div>
            <ActiveSessions workspaceId={workspace.id} />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add modules/settings/components/WorkspaceSettings/index.tsx
git commit -m "feat(session): add Active Sessions panel to WorkspaceSettings"
```

---

## Task 10: Enable Session Limit for Razorveda

Set `max_sessions = 2` in Razorveda's workspace settings. This activates the gate.

**Files:** No code changes. Run SQL in Supabase.

- [ ] **Step 1: Update Razorveda workspace settings in Supabase SQL editor**

```sql
UPDATE workspaces
SET settings = COALESCE(settings, '{}'::jsonb) || '{"max_sessions": 2}'::jsonb
WHERE id = '1bad6e27-f1fc-45ce-a876-98fb1db64373';

-- Verify
SELECT id, name, settings->>'max_sessions' AS max_sessions
FROM workspaces
WHERE id = '1bad6e27-f1fc-45ce-a876-98fb1db64373';
-- Expected: max_sessions = 2
```

- [ ] **Step 2: End-to-end test**

1. Log in to Razorveda as super_admin in Browser A → should reach dashboard (session created).
2. Log in in Browser B → should reach dashboard (2nd session created).
3. Log in in Browser C (incognito or different browser) → should hit `/session-limit?reason=limit`.
4. Log out from Browser A → slot freed.
5. Try Browser C again → should now reach dashboard (count is now 1 < 2).
6. In Settings → Workspace → Active Sessions, verify sessions listed correctly.

- [ ] **Step 3: Commit**

```bash
git add -p   # no files changed — SQL ran in Supabase directly
git commit --allow-empty -m "chore: enable max_sessions=2 for Razorveda workspace (applied via SQL)"
```

---

## Task 11: DB Migration — Lead Temperature Trigger

**Files:**
- Create: `database/migrations/054_lead_temp_trigger.sql`

Note: The KanbanBoard temperature filter (All/Hot/Warm/Cold pills) and LeadCard temperature badges already exist and are fully functional. **No frontend changes needed** — the DB update from the trigger is immediately reflected when leads are refetched.

**Interfaces:**
- Produces: `AFTER INSERT ON messages` trigger that updates `leads.temperature` for the linked conversation when a qualifying message is inserted. Never downgrades (takes max of current and new count-based temp).

- [ ] **Step 1: Write the migration**

```sql
-- 054_lead_temp_trigger.sql
-- Automatically updates leads.temperature based on message count in the linked conversation.
-- Qualifying messages: sender_type IN ('contact','agent'), type != 'internal_note', is_deleted = false
-- Thresholds: < 4 = cold, 4-7 = warm, >= 8 = hot
-- Never downgrades: UPDATE only fires when new temp rank > current temp rank.
-- Runs alongside the existing keyword-based detectLeadTemperature() in webhook — both only upgrade.

-- Helper: map count to temperature string
CREATE OR REPLACE FUNCTION public.classify_temp_by_count(v_count INTEGER)
RETURNS VARCHAR(10)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v_count >= 8 THEN 'hot'
    WHEN v_count >= 4 THEN 'warm'
    ELSE 'cold'
  END;
$$;

-- Helper: rank temperature for comparison (hot > warm > cold)
CREATE OR REPLACE FUNCTION public.temperature_rank(temp VARCHAR(10))
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE temp
    WHEN 'hot'  THEN 2
    WHEN 'warm' THEN 1
    ELSE 0
  END;
$$;

-- Trigger function
CREATE OR REPLACE FUNCTION public.update_lead_temp_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id    UUID;
  v_current    VARCHAR(10);
  v_msg_count  INTEGER;
  v_count_temp VARCHAR(10);
BEGIN
  -- Only process qualifying messages
  IF NEW.sender_type NOT IN ('contact', 'agent')        THEN RETURN NEW; END IF;
  IF NEW.type = 'internal_note'                         THEN RETURN NEW; END IF;
  IF NEW.is_deleted = true                              THEN RETURN NEW; END IF;

  -- Find the lead linked to this conversation
  SELECT id, temperature
    INTO v_lead_id, v_current
    FROM public.leads
   WHERE conversation_id = NEW.conversation_id
   LIMIT 1;

  IF v_lead_id IS NULL THEN RETURN NEW; END IF;

  -- Count all qualifying messages in this conversation (including the new one)
  SELECT COUNT(*)
    INTO v_msg_count
    FROM public.messages
   WHERE conversation_id = NEW.conversation_id
     AND sender_type IN ('contact', 'agent')
     AND (type IS NULL OR type != 'internal_note')
     AND is_deleted = false;

  v_count_temp := classify_temp_by_count(v_msg_count);

  -- Only update if the count-based temp is higher than the current temp (never downgrade)
  IF temperature_rank(v_count_temp) > temperature_rank(COALESCE(v_current, 'cold')) THEN
    UPDATE public.leads
       SET temperature = v_count_temp,
           updated_at  = NOW()
     WHERE id = v_lead_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists (idempotent)
DROP TRIGGER IF EXISTS trg_lead_temp_on_message ON public.messages;

CREATE TRIGGER trg_lead_temp_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lead_temp_on_message();
```

- [ ] **Step 2: Run in Supabase SQL editor**

Paste and execute. Verify:

```sql
-- Confirm trigger exists
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trg_lead_temp_on_message';
-- Expected: 1 row, AFTER INSERT

-- Quick logic test: call helpers directly
SELECT classify_temp_by_count(2);   -- expected: cold
SELECT classify_temp_by_count(5);   -- expected: warm
SELECT classify_temp_by_count(9);   -- expected: hot
SELECT temperature_rank('hot');     -- expected: 2
SELECT temperature_rank('cold');    -- expected: 0
```

- [ ] **Step 3: End-to-end test**

Pick a lead with a linked conversation and check its current `temperature`. Simulate new messages:

```sql
-- Find a lead with a linked conversation
SELECT l.id, l.temperature, l.conversation_id,
       COUNT(m.id) FILTER (
         WHERE m.sender_type IN ('contact','agent')
           AND (m.type IS NULL OR m.type != 'internal_note')
           AND m.is_deleted = false
       ) AS qualifying_count
FROM leads l
LEFT JOIN messages m ON m.conversation_id = l.conversation_id
GROUP BY l.id, l.temperature, l.conversation_id
ORDER BY qualifying_count DESC
LIMIT 5;
```

Then insert a test message into a conversation that has < 4 qualifying messages:

```sql
-- Insert test message (replace UUIDs with real values from above query)
INSERT INTO messages (conversation_id, workspace_id, sender_type, direction, type, content, status)
VALUES (
  '<conversation_id>',
  '<workspace_id>',
  'contact', 'inbound', 'text', 'test message for trigger validation', 'delivered'
);

-- Check lead temperature updated
SELECT id, temperature FROM leads WHERE conversation_id = '<conversation_id>';
```

- [ ] **Step 4: Commit**

```bash
git add database/migrations/054_lead_temp_trigger.sql
git commit -m "feat(leads): auto-update temperature from message count via DB trigger"
```

---

## Task 12: Deploy & Verify

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

- [ ] **Step 2: Trigger Coolify redeploy**

Coolify → Manual deploy. Watch for commit `HEAD` in deployment logs.

- [ ] **Step 3: Verify Feature 1 in production**

1. Log into Razorveda super_admin account in Browser A → reaches dashboard.
2. Log into same account in Browser B → reaches dashboard.
3. Log into same account in Browser C → redirected to `/session-limit?reason=limit` with clear message.
4. Log out from Browser A → go to Browser C → Try Again → reaches dashboard.
5. Settings → Workspace → Active Sessions → shows 2 sessions (B and C), Revoke works.
6. Log in as an agent in Browser D (different account) → no gate at all, reaches dashboard immediately.

- [ ] **Step 4: Verify Feature 2 in production**

Open a WhatsApp conversation that has 2 messages. Check the linked lead's temperature in CRM → should be Cold. Send 2 more messages (making 4 total). Refresh CRM → lead should now show Warm. The KanbanBoard temperature filter (All/Cold/Warm/Hot) should filter correctly.

---

## Self-Review Notes

**Spec coverage:**
- ✅ Max 2 sessions (Tasks 1–4, 10)
- ✅ Session tracking with user_agent, IP, timestamps (Task 1)
- ✅ Automatic release on logout (Task 7)
- ✅ Revocation by admin (Tasks 8–9)
- ✅ Heartbeat for browser-close graceful expiry (Task 6)
- ✅ `max_sessions` configurable per workspace without code changes (Task 10 pattern)
- ✅ Blocked user sees clear message with Try Again (Task 5)
- ✅ Cold/Warm/Hot thresholds (Task 11)
- ✅ Dynamic update as conversation grows (Task 11 trigger fires on every INSERT)
- ✅ Keyword detection still upgrades (existing `autoCreateOrUpdateLead()` unchanged)
- ✅ Never downgrade (both trigger and keyword detection use rank-comparison)
- ✅ Agent/outbound messages also counted — trigger fires on all message sources (Task 11)

**Key decisions documented:**
- `manager` role is NOT gated (only super_admin + admin) — per user requirement.
- Session cookie is set via `/api/session/init` redirect (Server Components cannot write cookies).
- Supabase JWT is NOT invalidated when session limit is hit — user sees session-limit page, can try again without re-entering password.
- Lead temp frontend (KanbanBoard filter, LeadCard badges) already existed — no changes needed.
