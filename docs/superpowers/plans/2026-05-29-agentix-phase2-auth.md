# Agentix Phase 2 — Authentication & Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, production-grade authentication system with Supabase Auth, real login/signup/forgot-password/verify-email pages, workspace creation & selection flows, and proper middleware-enforced route guarding.

**Architecture:** Next.js 15 Server Actions handle all auth mutations (no client-side Supabase calls for state changes); Supabase Auth stores credentials; a `profiles` table extends `auth.users`; `workspaces` + `workspace_members` tables power multi-tenancy. After sign-up the user is routed to workspace creation; returning users with a workspace go directly to `/conversations`.

**Tech Stack:** Next.js 15 Server Actions, @supabase/ssr, React Hook Form + Zod, shadcn/ui (Button, Input, Label, Card, Form), Framer Motion (scaleIn variant), Sonner toasts, Zustand auth/workspace stores.

---

## File Map

### New files
```
database/migrations/001_auth_workspace.sql     — profiles, workspaces, workspace_members DDL + RLS
modules/auth/types/index.ts                    — form input types (LoginInput, SignupInput, etc.)
modules/auth/services/auth.service.ts          — thin Supabase Auth wrappers (server-side)
modules/auth/services/workspace.service.ts     — workspace DB read/write (server-side)
modules/auth/components/AuthCard.tsx           — animated centered card wrapper
modules/auth/components/LoginForm.tsx          — email+password form, server action submit
modules/auth/components/SignupForm.tsx         — name+email+password form
modules/auth/components/ForgotPasswordForm.tsx — email form → reset email sent
modules/auth/components/WorkspaceCreateForm.tsx— workspace name+slug form
app/actions/auth.actions.ts                    — signIn, signUp, signOut, resetPassword server actions
app/actions/workspace.actions.ts               — createWorkspace, getUserWorkspaces server actions
app/api/auth/callback/route.ts                 — Supabase PKCE callback handler
app/(auth)/workspace/new/page.tsx              — first-time workspace creation page
app/(auth)/workspace/select/page.tsx           — workspace picker for multi-workspace users
lib/constants.ts                               — APP_URL, route constants
```

### Modified files
```
app/(auth)/login/page.tsx           — replace placeholder with LoginForm
app/(auth)/signup/page.tsx          — replace placeholder with SignupForm
app/(auth)/forgot-password/page.tsx — replace placeholder with ForgotPasswordForm
app/(auth)/verify-email/page.tsx    — handle OTP token from Supabase email link
middleware.ts                       — add unauthenticated redirect to /login
```

---

## Task 1: Core Database Migration (profiles + workspaces)

**Files:**
- Create: `d:\WhatsApp-Automation\database\migrations\001_auth_workspace.sql`

- [ ] **Step 1: Write the SQL migration**

Write `d:\WhatsApp-Automation\database\migrations\001_auth_workspace.sql`:

```sql
-- ════════════════════════════════════════════════════════
-- 001_auth_workspace.sql
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ════════════════════════════════════════════════════════

-- ENUMS
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'manager', 'agent');

-- ────────────────────────────────────────────────────────
-- PROFILES  (extends auth.users 1-to-1)
-- ────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   VARCHAR(255) NOT NULL DEFAULT '',
  email       VARCHAR(255) UNIQUE NOT NULL,
  avatar_url  TEXT,
  phone       VARCHAR(50),
  timezone    VARCHAR(100) DEFAULT 'UTC',
  preferences JSONB DEFAULT '{}',
  last_seen_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_owner" ON public.profiles
  FOR ALL USING (id = auth.uid());

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ────────────────────────────────────────────────────────
-- WORKSPACES
-- ────────────────────────────────────────────────────────
CREATE TABLE public.workspaces (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255) NOT NULL,
  slug             VARCHAR(100) UNIQUE NOT NULL,
  logo_url         TEXT,
  plan             VARCHAR(50) DEFAULT 'starter',
  waba_id          VARCHAR(255),
  phone_number_id  VARCHAR(255),
  access_token     TEXT,
  webhook_secret   VARCHAR(255),
  settings         JSONB DEFAULT '{}',
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspaces_member_read" ON public.workspaces
  FOR SELECT USING (
    id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspaces_admin_write" ON public.workspaces
  FOR UPDATE USING (
    id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- ────────────────────────────────────────────────────────
-- WORKSPACE MEMBERS
-- ────────────────────────────────────────────────────────
CREATE TABLE public.workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         user_role NOT NULL DEFAULT 'agent',
  is_online    BOOLEAN DEFAULT false,
  max_chats    INTEGER DEFAULT 10,
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_workspace_isolation" ON public.workspace_members
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members wm2 WHERE wm2.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON public.workspace_members(workspace_id);
CREATE INDEX idx_profiles_email ON public.profiles(email);
```

- [ ] **Step 2: Apply in Supabase Dashboard**

Open: https://supabase.com/dashboard → your project → SQL Editor → paste and run the SQL.

Expected: `Success. No rows returned.` with no errors.

- [ ] **Step 3: Generate updated TypeScript types**

```powershell
# Replace YOUR_PROJECT_ID with your Supabase project ID
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > "d:\WhatsApp-Automation\types\database.types.ts"
```

If Supabase CLI not installed:
```powershell
npm install -g supabase
supabase login
```

If you want to defer type gen, the placeholder in `types/database.types.ts` is already compatible — skip this step until Phase 3.

- [ ] **Step 4: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add database/migrations/001_auth_workspace.sql
git commit -m "feat: add profiles, workspaces, workspace_members migration with RLS"
```

---

## Task 2: Auth Types and Constants

**Files:**
- Create: `d:\WhatsApp-Automation\modules\auth\types\index.ts`
- Create: `d:\WhatsApp-Automation\lib\constants.ts`

- [ ] **Step 1: Write auth form types**

Write `d:\WhatsApp-Automation\modules\auth\types\index.ts`:

```typescript
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const signupSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

export const workspaceCreateSchema = z.object({
  name: z.string().min(2, 'Workspace name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
});

export type LoginInput           = z.infer<typeof loginSchema>;
export type SignupInput           = z.infer<typeof signupSchema>;
export type ForgotPasswordInput  = z.infer<typeof forgotPasswordSchema>;
export type WorkspaceCreateInput = z.infer<typeof workspaceCreateSchema>;

export interface AuthActionResult {
  success: boolean;
  error?: string;
  redirectTo?: string;
}
```

- [ ] **Step 2: Write app constants**

Write `d:\WhatsApp-Automation\lib\constants.ts`:

```typescript
export const APP_NAME = 'Agentix';
export const APP_URL  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const ROUTES = {
  LOGIN:              '/login',
  SIGNUP:             '/signup',
  FORGOT_PASSWORD:    '/forgot-password',
  VERIFY_EMAIL:       '/verify-email',
  WORKSPACE_NEW:      '/workspace/new',
  WORKSPACE_SELECT:   '/workspace/select',
  DASHBOARD:          '/conversations',
  AUTH_CALLBACK:      '/api/auth/callback',
} as const;

export const SUPABASE_ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Incorrect email or password.',
  'Email not confirmed':        'Please verify your email before signing in.',
  'User already registered':    'An account with this email already exists.',
  'Password should be at least 6 characters': 'Password must be at least 8 characters.',
};

export function friendlySupabaseError(message: string): string {
  return SUPABASE_ERRORS[message] ?? message;
}
```

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/auth/types/index.ts lib/constants.ts
git commit -m "feat: add auth form Zod schemas and app route constants"
```

---

## Task 3: Auth Service Layer

**Files:**
- Create: `d:\WhatsApp-Automation\modules\auth\services\auth.service.ts`
- Create: `d:\WhatsApp-Automation\modules\auth\services\workspace.service.ts`

- [ ] **Step 1: Write auth service (server-side only)**

Write `d:\WhatsApp-Automation\modules\auth\services\auth.service.ts`:

```typescript
import { createClient } from '@/services/supabase/server';
import { friendlySupabaseError } from '@/lib/constants';

export async function signInWithPassword(email: string, password: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: friendlySupabaseError(error.message) };
  return { user: data.user, error: null };
}

export async function signUp(email: string, password: string, fullName: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
    },
  });
  if (error) return { user: null, error: friendlySupabaseError(error.message) };
  return { user: data.user, error: null };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function resetPasswordForEmail(email: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=/reset-password`,
  });
  if (error) return { error: friendlySupabaseError(error.message) };
  return { error: null };
}

export async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
```

- [ ] **Step 2: Write workspace service**

Write `d:\WhatsApp-Automation\modules\auth\services\workspace.service.ts`:

```typescript
import { createClient } from '@/services/supabase/server';

export async function getUserWorkspaces(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, workspace:workspaces(id, name, slug, logo_url, plan, waba_id, phone_number_id)')
    .eq('user_id', userId);

  if (error || !data) return [];

  return data.map((m) => ({
    ...(m.workspace as {
      id: string;
      name: string;
      slug: string;
      logo_url: string | null;
      plan: string;
      waba_id: string | null;
      phone_number_id: string | null;
    }),
    role: m.role as string,
  }));
}

export async function createWorkspace(
  userId: string,
  name: string,
  slug: string,
): Promise<{ workspaceId: string | null; error: string | null }> {
  const supabase = await createClient();

  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert({ name, slug })
    .select('id')
    .single();

  if (wsError || !workspace) {
    if (wsError?.code === '23505') return { workspaceId: null, error: 'That slug is already taken. Try another.' };
    return { workspaceId: null, error: wsError?.message ?? 'Failed to create workspace.' };
  }

  const { error: memberError } = await supabase
    .from('workspace_members')
    .insert({ workspace_id: workspace.id, user_id: userId, role: 'super_admin' });

  if (memberError) return { workspaceId: null, error: memberError.message };

  return { workspaceId: workspace.id, error: null };
}
```

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/auth/services/
git commit -m "feat: add server-side auth and workspace service functions"
```

---

## Task 4: Server Actions (auth + workspace)

**Files:**
- Create: `d:\WhatsApp-Automation\app\actions\auth.actions.ts`
- Create: `d:\WhatsApp-Automation\app\actions\workspace.actions.ts`

- [ ] **Step 1: Write auth server actions**

Write `d:\WhatsApp-Automation\app\actions\auth.actions.ts`:

```typescript
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { loginSchema, signupSchema, forgotPasswordSchema } from '@/modules/auth/types';
import { signInWithPassword, signUp, signOut, resetPasswordForEmail } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { ROUTES } from '@/lib/constants';
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

  const { user, error } = await signInWithPassword(parsed.data.email, parsed.data.password);
  if (error || !user) return { success: false, error: error ?? 'Sign in failed.' };

  const workspaces = await getUserWorkspaces(user.id);

  revalidatePath('/', 'layout');

  if (workspaces.length === 0) return { success: true, redirectTo: ROUTES.WORKSPACE_NEW };
  if (workspaces.length === 1) return { success: true, redirectTo: ROUTES.DASHBOARD };
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

  const { user, error } = await signUp(parsed.data.email, parsed.data.password, parsed.data.full_name);
  if (error || !user) return { success: false, error: error ?? 'Sign up failed.' };

  // Supabase sends confirmation email — tell user to verify
  return { success: true, redirectTo: `${ROUTES.VERIFY_EMAIL}?email=${encodeURIComponent(parsed.data.email)}` };
}

export async function forgotPasswordAction(
  _prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const raw = { email: formData.get('email') };
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: 'Enter a valid email.' };

  const { error } = await resetPasswordForEmail(parsed.data.email);
  if (error) return { success: false, error };

  return { success: true };
}

export async function signOutAction(): Promise<void> {
  await signOut();
  revalidatePath('/', 'layout');
  redirect(ROUTES.LOGIN);
}
```

- [ ] **Step 2: Write workspace server actions**

Write `d:\WhatsApp-Automation\app\actions\workspace.actions.ts`:

```typescript
'use server';

import { redirect } from 'next/navigation';
import { workspaceCreateSchema } from '@/modules/auth/types';
import { createWorkspace } from '@/modules/auth/services/workspace.service';
import { getUser } from '@/modules/auth/services/auth.service';
import { ROUTES } from '@/lib/constants';
import type { AuthActionResult } from '@/modules/auth/types';

export async function createWorkspaceAction(
  _prev: AuthActionResult,
  formData: FormData,
): Promise<AuthActionResult> {
  const raw = { name: formData.get('name'), slug: formData.get('slug') };
  const parsed = workspaceCreateSchema.safeParse(raw);

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const user = await getUser();
  if (!user) return { success: false, error: 'Not authenticated.' };

  const { workspaceId, error } = await createWorkspace(user.id, parsed.data.name, parsed.data.slug);
  if (error || !workspaceId) return { success: false, error: error ?? 'Failed to create workspace.' };

  redirect(ROUTES.DASHBOARD);
}
```

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add app/actions/
git commit -m "feat: add auth and workspace server actions with Zod validation"
```

---

## Task 5: Auth Callback Route

**Files:**
- Create: `d:\WhatsApp-Automation\app\api\auth\callback\route.ts`

- [ ] **Step 1: Write the callback handler**

Write `d:\WhatsApp-Automation\app\api\auth\callback\route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { ROUTES } from '@/lib/constants';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code      = searchParams.get('code');
  const next      = searchParams.get('next') ?? ROUTES.DASHBOARD;
  const tokenHash = searchParams.get('token_hash');
  const type      = searchParams.get('type') as 'signup' | 'recovery' | null;

  const supabase = await createClient();

  // Email link flow (signup confirmation, password reset)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}${ROUTES.LOGIN}?error=verification_failed`);
  }

  // OAuth / PKCE code exchange
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}${ROUTES.LOGIN}?error=auth_failed`);
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add app/api/auth/callback/route.ts
git commit -m "feat: add Supabase PKCE auth callback and OTP verification handler"
```

---

## Task 6: AuthCard Shared Component

**Files:**
- Create: `d:\WhatsApp-Automation\modules\auth\components\AuthCard.tsx`

- [ ] **Step 1: Write AuthCard**

Write `d:\WhatsApp-Automation\modules\auth\components\AuthCard.tsx`:

```typescript
'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AuthCardProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  className?: string;
}

const cardVariant = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
};

export function AuthCard({ children, title, subtitle, className }: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary px-4">
      <div className="w-full max-w-md">

        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white font-bold text-xl shadow-lg shadow-brand-500/30 mb-4">
            A
          </div>
          <h1 className="text-display-lg font-bold text-foreground">Agentix</h1>
        </div>

        {/* Card */}
        <motion.div
          variants={cardVariant}
          initial="initial"
          animate="animate"
          className={cn(
            'rounded-2xl border border-border bg-surface-primary p-8 shadow-xl shadow-black/5',
            className,
          )}
        >
          <div className="mb-6">
            <h2 className="text-heading-lg font-semibold text-foreground">{title}</h2>
            {subtitle && (
              <p className="mt-1 text-body-md text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {children}
        </motion.div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/auth/components/AuthCard.tsx
git commit -m "feat: add animated AuthCard wrapper component"
```

---

## Task 7: Login Form

**Files:**
- Create: `d:\WhatsApp-Automation\modules\auth\components\LoginForm.tsx`
- Modify: `d:\WhatsApp-Automation\app\(auth)\login\page.tsx`

- [ ] **Step 1: Write LoginForm component**

Write `d:\WhatsApp-Automation\modules\auth\components\LoginForm.tsx`:

```typescript
'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction } from '@/app/actions/auth.actions';
import type { AuthActionResult } from '@/modules/auth/types';

const initialState: AuthActionResult = { success: false };

export function LoginForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  useEffect(() => {
    if (state.success && state.redirectTo) {
      router.push(state.redirectTo);
    }
    if (!state.success && state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-label text-brand-600 hover:text-brand-700 transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          className="h-11"
        />
      </div>

      {!state.success && state.error && (
        <p className="text-label text-destructive">{state.error}</p>
      )}

      <Button
        type="submit"
        className="w-full h-11 bg-brand-500 hover:bg-brand-600 text-white font-medium"
        disabled={isPending}
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-center text-body-md text-muted-foreground">
        No account?{' '}
        <Link href="/signup" className="text-brand-600 hover:text-brand-700 font-medium transition-colors">
          Create one free
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Replace login page placeholder**

Write `d:\WhatsApp-Automation\app\(auth)\login\page.tsx`:

```typescript
import type { Metadata } from 'next';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { LoginForm } from '@/modules/auth/components/LoginForm';

export const metadata: Metadata = { title: 'Sign In' };

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your Agentix workspace"
    >
      <LoginForm />
    </AuthCard>
  );
}
```

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/auth/components/LoginForm.tsx app/(auth)/login/page.tsx
git commit -m "feat: build login page with server action, Sonner toast, and brand styling"
```

---

## Task 8: Signup Form

**Files:**
- Create: `d:\WhatsApp-Automation\modules\auth\components\SignupForm.tsx`
- Modify: `d:\WhatsApp-Automation\app\(auth)\signup\page.tsx`

- [ ] **Step 1: Write SignupForm**

Write `d:\WhatsApp-Automation\modules\auth\components\SignupForm.tsx`:

```typescript
'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signupAction } from '@/app/actions/auth.actions';
import type { AuthActionResult } from '@/modules/auth/types';

const initialState: AuthActionResult = { success: false };

export function SignupForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(signupAction, initialState);

  useEffect(() => {
    if (state.success && state.redirectTo) {
      router.push(state.redirectTo);
    }
    if (!state.success && state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="full_name">Full name</Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          placeholder="Alex Johnson"
          required
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="alex@company.com"
          required
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Min. 8 chars, 1 uppercase, 1 number"
          required
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm_password">Confirm password</Label>
        <Input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
          className="h-11"
        />
      </div>

      {!state.success && state.error && (
        <p className="text-label text-destructive">{state.error}</p>
      )}

      <Button
        type="submit"
        className="w-full h-11 bg-brand-500 hover:bg-brand-600 text-white font-medium"
        disabled={isPending}
      >
        {isPending ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-body-md text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-600 hover:text-brand-700 font-medium transition-colors">
          Sign in
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Replace signup page placeholder**

Write `d:\WhatsApp-Automation\app\(auth)\signup\page.tsx`:

```typescript
import type { Metadata } from 'next';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { SignupForm } from '@/modules/auth/components/SignupForm';

export const metadata: Metadata = { title: 'Create Account' };

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Start managing WhatsApp conversations at scale"
    >
      <SignupForm />
    </AuthCard>
  );
}
```

- [ ] **Step 3: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/auth/components/SignupForm.tsx app/(auth)/signup/page.tsx
git commit -m "feat: build signup page with validation, confirm password check"
```

---

## Task 9: Forgot Password + Verify Email Pages

**Files:**
- Create: `d:\WhatsApp-Automation\modules\auth\components\ForgotPasswordForm.tsx`
- Modify: `d:\WhatsApp-Automation\app\(auth)\forgot-password\page.tsx`
- Modify: `d:\WhatsApp-Automation\app\(auth)\verify-email\page.tsx`

- [ ] **Step 1: Write ForgotPasswordForm**

Write `d:\WhatsApp-Automation\modules\auth\components\ForgotPasswordForm.tsx`:

```typescript
'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { forgotPasswordAction } from '@/app/actions/auth.actions';
import type { AuthActionResult } from '@/modules/auth/types';

const initialState: AuthActionResult = { success: false };

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success('Check your inbox — reset link sent!');
    }
    if (!state.success && state.error) {
      toast.error(state.error);
    }
  }, [state]);

  if (state.success) {
    return (
      <div className="text-center space-y-4">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600 text-2xl mx-auto">
          ✉
        </div>
        <p className="text-body-md text-muted-foreground">
          We sent a password reset link to your email. Check your inbox and spam folder.
        </p>
        <Link
          href="/login"
          className="inline-block text-brand-600 hover:text-brand-700 font-medium text-body-md transition-colors"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          className="h-11"
        />
      </div>

      {!state.success && state.error && (
        <p className="text-label text-destructive">{state.error}</p>
      )}

      <Button
        type="submit"
        className="w-full h-11 bg-brand-500 hover:bg-brand-600 text-white font-medium"
        disabled={isPending}
      >
        {isPending ? 'Sending link…' : 'Send reset link'}
      </Button>

      <p className="text-center">
        <Link href="/login" className="text-label text-muted-foreground hover:text-foreground transition-colors">
          ← Back to sign in
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Replace forgot-password page**

Write `d:\WhatsApp-Automation\app\(auth)\forgot-password\page.tsx`:

```typescript
import type { Metadata } from 'next';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { ForgotPasswordForm } from '@/modules/auth/components/ForgotPasswordForm';

export const metadata: Metadata = { title: 'Reset Password' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link"
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
```

- [ ] **Step 3: Replace verify-email page**

Write `d:\WhatsApp-Automation\app\(auth)\verify-email\page.tsx`:

```typescript
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/modules/auth/components/AuthCard';

export const metadata: Metadata = { title: 'Verify Email' };

interface VerifyEmailPageProps {
  searchParams: Promise<{ email?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { email } = await searchParams;

  return (
    <AuthCard title="Check your email" subtitle="We sent you a verification link">
      <div className="space-y-6 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-3xl mx-auto">
          📬
        </div>

        <div className="space-y-2">
          <p className="text-body-md text-muted-foreground">
            We sent a verification link to{' '}
            {email ? (
              <span className="font-medium text-foreground">{email}</span>
            ) : (
              'your email address'
            )}
            .
          </p>
          <p className="text-body-md text-muted-foreground">
            Click the link in that email to activate your account.
          </p>
        </div>

        <div className="pt-2 border-t border-border">
          <p className="text-label text-muted-foreground mb-2">
            Already verified?
          </p>
          <Link
            href="/login"
            className="inline-block text-brand-600 hover:text-brand-700 font-medium text-body-md transition-colors"
          >
            Sign in →
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}
```

- [ ] **Step 4: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/auth/components/ForgotPasswordForm.tsx app/(auth)/forgot-password/page.tsx app/(auth)/verify-email/page.tsx
git commit -m "feat: build forgot-password and verify-email pages"
```

---

## Task 10: Workspace Creation Page

**Files:**
- Create: `d:\WhatsApp-Automation\modules\auth\components\WorkspaceCreateForm.tsx`
- Create: `d:\WhatsApp-Automation\app\(auth)\workspace\new\page.tsx`

- [ ] **Step 1: Write WorkspaceCreateForm**

Write `d:\WhatsApp-Automation\modules\auth\components\WorkspaceCreateForm.tsx`:

```typescript
'use client';

import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createWorkspaceAction } from '@/app/actions/workspace.actions';
import type { AuthActionResult } from '@/modules/auth/types';

const initialState: AuthActionResult = { success: false };

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 50);
}

export function WorkspaceCreateForm() {
  const [state, formAction, isPending] = useActionState(createWorkspaceAction, initialState);
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (!state.success && state.error) {
      toast.error(state.error);
    }
  }, [state]);

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!slugTouched) setSlug(toSlug(e.target.value));
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Workspace name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="Acme Corp"
          required
          className="h-11"
          onChange={handleNameChange}
        />
        <p className="text-caption text-muted-foreground">
          This is the name your team will see.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">Workspace URL</Label>
        <div className="flex items-center gap-0">
          <span className="inline-flex h-11 items-center rounded-l-md border border-r-0 border-border bg-muted px-3 text-muted-foreground text-body-md select-none">
            agentix.io/
          </span>
          <Input
            id="slug"
            name="slug"
            type="text"
            placeholder="acme-corp"
            required
            className="h-11 rounded-l-none"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(toSlug(e.target.value));
            }}
          />
        </div>
        <p className="text-caption text-muted-foreground">
          Lowercase letters, numbers, and hyphens only.
        </p>
      </div>

      {!state.success && state.error && (
        <p className="text-label text-destructive">{state.error}</p>
      )}

      <Button
        type="submit"
        className="w-full h-11 bg-brand-500 hover:bg-brand-600 text-white font-medium"
        disabled={isPending}
      >
        {isPending ? 'Creating workspace…' : 'Create workspace'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Create workspace/new page**

First create the directory, then write the page:

```powershell
New-Item -ItemType Directory -Force "d:\WhatsApp-Automation\app\(auth)\workspace\new"
```

Write `d:\WhatsApp-Automation\app\(auth)\workspace\new\page.tsx`:

```typescript
import type { Metadata } from 'next';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { WorkspaceCreateForm } from '@/modules/auth/components/WorkspaceCreateForm';

export const metadata: Metadata = { title: 'Create Workspace' };

export default function WorkspaceNewPage() {
  return (
    <AuthCard
      title="Create your workspace"
      subtitle="Set up your team's WhatsApp CRM hub"
    >
      <WorkspaceCreateForm />
    </AuthCard>
  );
}
```

- [ ] **Step 3: Create workspace/select page for multi-workspace users**

```powershell
New-Item -ItemType Directory -Force "d:\WhatsApp-Automation\app\(auth)\workspace\select"
```

Write `d:\WhatsApp-Automation\app\(auth)\workspace\select\page.tsx`:

```typescript
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/modules/auth/components/AuthCard';
import { getUser } from '@/modules/auth/services/auth.service';
import { getUserWorkspaces } from '@/modules/auth/services/workspace.service';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Select Workspace' };

export default async function WorkspaceSelectPage() {
  const user = await getUser();
  if (!user) redirect(ROUTES.LOGIN);

  const workspaces = await getUserWorkspaces(user.id);
  if (workspaces.length === 0) redirect(ROUTES.WORKSPACE_NEW);
  if (workspaces.length === 1) redirect(ROUTES.DASHBOARD);

  return (
    <AuthCard title="Choose a workspace" subtitle="Select the workspace you want to enter">
      <div className="space-y-3">
        {workspaces.map((ws) => (
          <Link
            key={ws.id}
            href={`${ROUTES.DASHBOARD}?workspace=${ws.id}`}
            className={cn(
              'flex items-center gap-4 rounded-xl border border-border p-4',
              'hover:border-brand-500 hover:bg-brand-50 transition-all duration-150',
              'group cursor-pointer',
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white font-bold text-heading-md">
              {ws.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-body-lg text-foreground truncate">{ws.name}</p>
              <p className="text-label text-muted-foreground capitalize">{ws.role} · {ws.plan}</p>
            </div>
            <span className="text-muted-foreground group-hover:text-brand-500 transition-colors">→</span>
          </Link>
        ))}

        <div className="pt-2 border-t border-border text-center">
          <Link href={ROUTES.WORKSPACE_NEW} className="text-label text-brand-600 hover:text-brand-700 transition-colors">
            + Create new workspace
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}
```

- [ ] **Step 4: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add modules/auth/components/WorkspaceCreateForm.tsx "app/(auth)/workspace/"
git commit -m "feat: build workspace creation and multi-workspace selection pages"
```

---

## Task 11: Upgrade Middleware (Auth Guard)

**Files:**
- Modify: `d:\WhatsApp-Automation\middleware.ts`

- [ ] **Step 1: Add unauthenticated user redirect**

Write `d:\WhatsApp-Automation\middleware.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ROUTES } from '@/lib/constants';

const PUBLIC_ROUTES = [
  ROUTES.LOGIN,
  ROUTES.SIGNUP,
  ROUTES.FORGOT_PASSWORD,
  ROUTES.VERIFY_EMAIL,
  '/workspace/new',
  '/workspace/select',
  ROUTES.AUTH_CALLBACK,
];

const ROLE_PROTECTED_ROUTES: Array<{ path: string; allowedRoles: string[] }> = [
  { path: '/settings/billing', allowedRoles: ['super_admin', 'admin'] },
  { path: '/analytics',        allowedRoles: ['super_admin', 'admin', 'manager'] },
  { path: '/campaigns',        allowedRoles: ['super_admin', 'admin', 'manager'] },
  { path: '/team',             allowedRoles: ['super_admin', 'admin', 'manager'] },
];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Static assets and Next.js internals — pass through
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Public auth routes — pass through
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    },
  );

  // Refresh session
  const { data: { user } } = await supabase.auth.getUser();

  // Unauthenticated → redirect to login
  if (!user) {
    const loginUrl = new URL(ROUTES.LOGIN, request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based route guard
  const roleHeader = request.cookies.get('agentix-role')?.value;
  if (roleHeader) {
    const restricted = ROLE_PROTECTED_ROUTES.find((r) => pathname.startsWith(r.path));
    if (restricted && !restricted.allowedRoles.includes(roleHeader)) {
      return NextResponse.redirect(new URL(ROUTES.DASHBOARD, request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

- [ ] **Step 2: Commit**

```powershell
cd "d:\WhatsApp-Automation"
git add middleware.ts
git commit -m "feat: upgrade middleware with full auth guard — unauthenticated users redirected to /login"
```

---

## Task 12: Verify Build and Live Smoke Test

- [ ] **Step 1: Run TypeScript check**

```powershell
cd "d:\WhatsApp-Automation"; npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Expected: zero errors.

- [ ] **Step 2: Run production build**

```powershell
cd "d:\WhatsApp-Automation"; npm run build 2>&1 | Select-Object -Last 25
```

Expected: `✓ Compiled successfully`, all routes listed including `/workspace/new` and `/workspace/select`.

- [ ] **Step 3: Start dev server and check all routes**

```powershell
# Kill any existing dev server
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "" } | Stop-Process -Force -ErrorAction SilentlyContinue
```

Then start: `npm run dev` and verify:
- `http://localhost:3000/login` → shows enterprise login card with email/password form
- `http://localhost:3000/signup` → shows signup card with 4 fields
- `http://localhost:3000/forgot-password` → shows email reset form
- `http://localhost:3000/verify-email?email=test@test.com` → shows verify email card
- `http://localhost:3000/workspace/new` → shows workspace creation card
- `http://localhost:3000/conversations` → redirects to `/login?next=/conversations` (auth guard working)

- [ ] **Step 4: Final commit**

```powershell
cd "d:\WhatsApp-Automation"
git add -A
git commit -m "chore: Phase 2 complete — full auth system verified"
```

---

## Spec Coverage Check

| Blueprint Requirement | Covered | Task |
|---|---|---|
| Login page (email + password) | ✅ | Task 7 |
| Signup page (name + email + password) | ✅ | Task 8 |
| Forgot password page | ✅ | Task 9 |
| Email verification page | ✅ | Task 9 |
| Supabase Auth integration | ✅ | Tasks 3, 4 |
| Server actions (not client-side mutations) | ✅ | Task 4 |
| Zod validation on all inputs | ✅ | Task 2, 4 |
| Auth callback handler (PKCE + OTP) | ✅ | Task 5 |
| Profiles table | ✅ | Task 1 |
| Workspaces table | ✅ | Task 1 |
| Workspace members table | ✅ | Task 1 |
| RLS on all tenant tables | ✅ | Task 1 |
| Workspace creation flow | ✅ | Task 10 |
| Multi-workspace selection | ✅ | Task 10 |
| Role system (super_admin → agent) | ✅ | Task 1 + existing types |
| Middleware auth guard (unauth → /login) | ✅ | Task 11 |
| Role-based route protection | ✅ | Task 11 |
| Framer Motion animations on auth cards | ✅ | Task 6 |
| Enterprise-grade UI (brand colors, shadcn) | ✅ | Tasks 6-10 |
| Sonner toast error feedback | ✅ | Tasks 7-9 |
| Auto-create profile trigger on sign-up | ✅ | Task 1 |
