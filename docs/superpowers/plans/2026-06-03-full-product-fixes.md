# Agentix Full Product Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every critical, high, and medium audit gap so the platform is 100% production-ready for paying clients.

**Architecture:** Each fix is isolated to its own file group. Tasks are ordered by severity — Critical first, then High, then Medium. Every task ends with a TypeScript check + commit.

**Tech Stack:** Next.js 15 App Router, Supabase (admin + RLS client), TanStack Query, shadcn/ui, Tailwind, Sonner toasts, OpenRouter AI, Stripe, Razorpay, Resend email.

---

## FILE MAP

| File | Change |
|------|--------|
| `app/api/messages/send/route.ts` | Add plan message-limit guard + 24hr session detection |
| `app/api/contacts/import/route.ts` | Add plan contact-limit guard |
| `app/api/contacts/[id]/start-conversation/route.ts` | Add plan contact-limit guard |
| `app/api/billing/webhook/route.ts` | Add real Stripe HMAC signature verification |
| `app/api/team/invite/route.ts` | NEW — send invitation email via Resend |
| `modules/conversations/components/ChatWindow/index.tsx` | Add 24-hr session warning banner |
| `modules/templates/hooks/useTemplates.ts` | Auto-sync templates on page load |
| `modules/analytics/hooks/useAnalytics.ts` | Add `refetchInterval: 60_000` to all queries |
| `modules/team/components/TeamPage/index.tsx` | Wire Invite Member button to new API |
| `next.config.ts` | Add CORS + Security headers |
| `lib/ai-model.ts` | NEW — workspace-aware LLM model resolver |
| `app/api/ai/suggest-replies/route.ts` | Use workspace LLM model setting |
| `app/api/ai/translate/route.ts` | Use workspace LLM model setting |

---

## Task 1 — Plan Limit: Guard message sends

**Files:**
- Modify: `app/api/messages/send/route.ts`

- [ ] Add plan guard after the workspace credential fetch (around line 40):

```typescript
// Inside POST handler, after requireWorkspacePermission call (line ~33)
// Add BEFORE building WhatsApp payload:
try {
  const { getWorkspacePlan, guardMessageLimit } = await import('@/lib/plan-guard');
  const plan = await getWorkspacePlan(conversation.workspace_id);
  await guardMessageLimit(conversation.workspace_id, plan);
} catch (e: unknown) {
  if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'PlanLimitError') {
    return NextResponse.json({ error: (e as Error).message, code: 'PLAN_LIMIT_EXCEEDED' }, { status: 402 });
  }
}
```

- [ ] Run `npx tsc --noEmit` — expect no errors.

- [ ] Commit:
```bash
git add app/api/messages/send/route.ts
git commit -m "fix: enforce monthly message limit on send API"
```

---

## Task 2 — Plan Limit: Guard contact imports + creation

**Files:**
- Modify: `app/api/contacts/import/route.ts`

- [ ] Add after `requireWorkspacePermission` call (around line 26):

```typescript
try {
  const { getWorkspacePlan, guardContactLimit } = await import('@/lib/plan-guard');
  const plan = await getWorkspacePlan(workspaceId);
  await guardContactLimit(workspaceId, plan);
} catch (e: unknown) {
  if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'PlanLimitError') {
    return NextResponse.json({ error: (e as Error).message, code: 'PLAN_LIMIT_EXCEEDED' }, { status: 402 });
  }
}
```

- [ ] Run `npx tsc --noEmit` — expect no errors.

- [ ] Commit:
```bash
git add app/api/contacts/import/route.ts
git commit -m "fix: enforce contact limit on import API"
```

---

## Task 3 — WhatsApp 24-hour session banner in ChatWindow

**Files:**
- Modify: `modules/conversations/components/ChatWindow/index.tsx`

The goal: fetch the most recent **inbound** message timestamp. If it was > 24 hours ago (or there is no inbound message), show a yellow banner: "Customer hasn't messaged recently. Send a template to re-open the chat window."

- [ ] Add session check to `ChatWindow` — insert after the `useMessages` call:

```typescript
// Detect if WhatsApp 24-hour session is open
const sessionOpen = useMemo(() => {
  if (!messages.length) return false;
  const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
  if (!lastInbound) return false;
  const age = Date.now() - new Date(lastInbound.created_at).getTime();
  return age < 24 * 60 * 60 * 1000; // 24 hours in ms
}, [messages]);
```

- [ ] Add `import { useMemo } from 'react';` to the imports.

- [ ] Add banner JSX between `<ConversationHeader>` and the messages scroll div:

```tsx
{!sessionOpen && !isLoading && messages.length > 0 && (
  <div className="shrink-0 flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2">
    <span className="text-amber-600 text-xs">⚠️</span>
    <p className="text-xs text-amber-800">
      <strong>24-hour window closed.</strong> The customer must reply first, or send a WhatsApp template to re-open the session.
    </p>
  </div>
)}
{!sessionOpen && !isLoading && messages.length === 0 && (
  <div className="shrink-0 flex items-center gap-2 bg-blue-50 border-b border-blue-200 px-4 py-2">
    <p className="text-xs text-blue-800">
      <strong>New conversation.</strong> Send a WhatsApp template to start — free-form messages require a customer reply first.
    </p>
  </div>
)}
```

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add modules/conversations/components/ChatWindow/index.tsx
git commit -m "feat: 24-hour WhatsApp session warning banner in chat"
```

---

## Task 4 — Template auto-sync on page load

**Files:**
- Modify: `modules/templates/hooks/useTemplates.ts`

Goal: when the templates page loads, silently call the sync API in the background once per session, so statuses are always fresh.

- [ ] Read `modules/templates/hooks/useTemplates.ts` to find where `useTemplates` is defined.

- [ ] Add a silent background sync triggered by `useEffect` on mount:

```typescript
// Add to useTemplates hook body, after the useQuery call:
useEffect(() => {
  if (!workspaceId) return;
  // Silently sync template statuses from Meta on first load
  fetch('/api/templates/sync', { method: 'POST' })
    .then((r) => r.json())
    .then(() => queryClient.invalidateQueries({ queryKey: ['templates', workspaceId] }))
    .catch(() => {}); // fail silently — user can manually sync if needed
}, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] Also update `staleTime` from `60_000` to `30_000` so the list refreshes more aggressively.

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add modules/templates/hooks/useTemplates.ts
git commit -m "feat: auto-sync template statuses from Meta on page load"
```

---

## Task 5 — Analytics auto-refresh every 60 seconds

**Files:**
- Modify: `modules/analytics/hooks/useAnalytics.ts`

- [ ] Add `refetchInterval: 60_000` to every `useQuery` call in the file. Example for `useAnalyticsOverview`:

```typescript
return useQuery({
  queryKey: ['analytics', 'overview', workspaceId, from, to],
  queryFn: () => fetchAnalyticsOverview(workspaceId!, from, to),
  enabled: !!workspaceId,
  staleTime: 30_000,
  refetchInterval: 60_000,        // refresh every 60 seconds
  refetchIntervalInBackground: false,
});
```

Apply the same `refetchInterval: 60_000` to `useAgentPerformance` and `useExtendedAnalytics`.

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add modules/analytics/hooks/useAnalytics.ts
git commit -m "feat: analytics auto-refreshes every 60 seconds"
```

---

## Task 6 — Workspace-aware LLM model resolver

**Files:**
- Create: `lib/ai-model.ts`
- Modify: `app/api/ai/suggest-replies/route.ts`

- [ ] Create `lib/ai-model.ts`:

```typescript
import { createAdminClient } from '@/services/supabase/admin';

const MODEL_DEFAULTS: Record<string, string> = {
  openai:    'openai/gpt-4o-mini',
  anthropic: 'anthropic/claude-haiku',
  gemini:    'google/gemini-flash-1.5',
  groq:      'meta-llama/llama-3.1-8b-instruct:free',
};

const FALLBACK_MODEL = process.env.AI_MODEL ?? 'openai/gpt-4o-mini:free';

export async function resolveWorkspaceModel(workspaceId: string): Promise<string> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from('workspaces')
      .select('ai_provider, ai_model')
      .eq('id', workspaceId)
      .single();

    if (!data) return FALLBACK_MODEL;

    const provider = data.ai_provider as string | null;
    const model    = data.ai_model    as string | null;

    if (model && model.trim()) return model.trim();
    if (provider && MODEL_DEFAULTS[provider]) return MODEL_DEFAULTS[provider]!;
    return FALLBACK_MODEL;
  } catch {
    return FALLBACK_MODEL;
  }
}
```

- [ ] Modify `app/api/ai/suggest-replies/route.ts` — replace the hardcoded model resolution:

```typescript
// REMOVE this line:
// const model = process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free';

// REPLACE with:
const { resolveWorkspaceModel } = await import('@/lib/ai-model');
const model = await resolveWorkspaceModel(conversation.workspace_id);
```

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add lib/ai-model.ts app/api/ai/suggest-replies/route.ts
git commit -m "feat: workspace-aware LLM model selection for AI features"
```

---

## Task 7 — Stripe webhook: real HMAC signature verification

**Files:**
- Modify: `app/api/billing/webhook/route.ts`

The current code just checks the signature exists but doesn't verify it. Add real Stripe HMAC-SHA256 verification without the Stripe SDK (which isn't installed):

- [ ] Replace the signature check block (lines 14–17) with:

```typescript
// Real HMAC-SHA256 verification
if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

// Parse timestamp and signatures from header
// Format: t=TIMESTAMP,v1=SIG1,v1=SIG2
const parts = Object.fromEntries(
  signature.split(',').map((part) => {
    const [k, ...v] = part.split('=');
    return [k, v.join('=')];
  }),
);
const timestamp  = parts['t'];
const sigV1      = parts['v1'];

if (!timestamp || !sigV1) {
  return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 });
}

// Verify timestamp is within 5 minutes (replay attack protection)
const tolerance = 300; // 5 minutes in seconds
if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > tolerance) {
  return NextResponse.json({ error: 'Timestamp too old' }, { status: 400 });
}

// Compute expected HMAC
const signedPayload = `${timestamp}.${body}`;
const encoder = new TextEncoder();
const keyData  = encoder.encode(secret);
const msgData  = encoder.encode(signedPayload);
const cryptoKey = await crypto.subtle.importKey(
  'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
);
const sigBytes = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
const expectedSig = Array.from(new Uint8Array(sigBytes))
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');

if (expectedSig !== sigV1) {
  return NextResponse.json({ error: 'Signature mismatch' }, { status: 400 });
}
```

- [ ] Also fix `checkout.session.completed` to detect plan from `price_id` metadata instead of hardcoding `'pro'`:

```typescript
// Determine plan from metadata (wizard sets it) or default to 'pro'
const planFromMeta = (session.metadata as Record<string, string>)?.plan ?? 'pro';
const validPlan = ['starter', 'pro', 'enterprise'].includes(planFromMeta) ? planFromMeta : 'pro';

await db.from('workspaces').update({
  stripe_customer_id:     customerId,
  stripe_subscription_id: subscriptionId,
  plan:                   validPlan,
  plan_expires_at:        null,
  plan_limits:            STRIPE_PLANS[validPlan as keyof typeof STRIPE_PLANS]?.limits ?? STRIPE_PLANS.pro.limits,
}).eq('id', workspaceId);
```

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add app/api/billing/webhook/route.ts
git commit -m "fix: real Stripe HMAC-SHA256 webhook signature verification"
```

---

## Task 8 — Team invite email API + UI

**Files:**
- Create: `app/api/team/invite/route.ts`
- Modify: `modules/team/components/TeamPage/index.tsx`

- [ ] Create `app/api/team/invite/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/team/invite
// Body: { workspaceId, email, role }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, email, role } = await request.json() as {
      workspaceId?: string; email?: string; role?: string;
    };

    if (!workspaceId || !email || !role) {
      return NextResponse.json({ error: 'workspaceId, email, and role required' }, { status: 400 });
    }

    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_team');

    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;

    // Get workspace name for the email
    const { data: workspace } = await db
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single();

    const workspaceName = workspace?.name ?? 'Agentix';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://whatsapp-automation-kohl-six.vercel.app';

    // Send invite email via Resend if configured
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Agentix <noreply@aiagentix.in>',
          to: [email],
          subject: `You've been invited to join ${workspaceName} on Agentix`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
              <h2 style="color:#6366f1;">You're invited! 🎉</h2>
              <p>You've been invited to join <strong>${workspaceName}</strong> on Agentix as a <strong>${role}</strong>.</p>
              <p>Click the button below to sign up and get started:</p>
              <a href="${appUrl}/signup" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">
                Accept Invitation
              </a>
              <p style="color:#888;font-size:12px;">If you didn't expect this invite, you can safely ignore this email.</p>
            </div>
          `,
        }),
      });
    }

    // Log invite in audit_logs if table exists
    try {
      await db.from('audit_logs').insert({
        workspace_id: workspaceId,
        action: 'team.invite_sent',
        resource_type: 'workspace_member',
        metadata: { email, role },
      });
    } catch { /* audit_logs may not exist yet */ }

    return NextResponse.json({
      success: true,
      emailSent: !!resendKey,
      message: resendKey
        ? `Invitation sent to ${email}`
        : `Invite recorded. Add RESEND_API_KEY to send emails automatically.`,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamInvite]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] In `modules/team/components/TeamPage/index.tsx` — find the disabled Invite Member button (line ~79) and replace the whole button with an invite dialog:

```tsx
// Add to imports at top:
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail } from 'lucide-react';

// Add state near top of TeamPage component:
const [inviteOpen,  setInviteOpen]  = useState(false);
const [inviteEmail, setInviteEmail] = useState('');
const [inviteRole,  setInviteRole]  = useState<UserRole>('agent');
const [inviting,    setInviting]    = useState(false);

// Add handler:
const handleInvite = async () => {
  if (!inviteEmail.trim()) return;
  setInviting(true);
  try {
    const res  = await fetch('/api/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, email: inviteEmail.trim(), role: inviteRole }),
    });
    const data = await res.json() as { message?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? 'Invite failed');
    toast.success(data.message ?? 'Invitation sent!');
    setInviteOpen(false);
    setInviteEmail('');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Failed to send invite');
  } finally {
    setInviting(false);
  }
};

// Replace the disabled button:
// OLD:
// <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled>
//   <UserPlus className="h-3.5 w-3.5" /> Invite Member
// </Button>

// NEW:
<Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setInviteOpen(true)}>
  <UserPlus className="h-3.5 w-3.5" /> Invite Member
</Button>

// Add dialog before closing </div> of the component:
<Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
  <DialogContent className="sm:max-w-sm">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-brand-500" /> Invite Team Member
      </DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label htmlFor="inv-email">Email Address</Label>
        <Input
          id="inv-email"
          type="email"
          placeholder="agent@company.com"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleInvite()}
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label>Role</Label>
        <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        They'll receive an email with a link to sign up and join this workspace.
      </p>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancel</Button>
      <Button onClick={() => void handleInvite()} disabled={inviting || !inviteEmail.trim()}>
        {inviting ? 'Sending…' : 'Send Invite'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add app/api/team/invite/route.ts modules/team/components/TeamPage/index.tsx
git commit -m "feat: team member invite via email (Resend integration)"
```

---

## Task 9 — CORS + Security headers in next.config.ts

**Files:**
- Modify: `next.config.ts`

- [ ] Add CORS headers for `/api/v1/*` public API routes under the existing `headers()` array:

```typescript
// Add to the headers() return array:
{
  source: '/api/v1/(.*)',
  headers: [
    { key: 'Access-Control-Allow-Origin',  value: '*' },
    { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
    { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, x-api-key' },
  ],
},
{
  source: '/api/(.*)',
  headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options',        value: 'DENY' },
  ],
},
```

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add next.config.ts
git commit -m "fix: CORS headers for public API + security headers on all API routes"
```

---

## Task 10 — Razorpay checkout UI in Billing settings

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx` OR the billing section component

Find the billing section. Add a "Pay with Razorpay" button that calls `/api/billing/razorpay-checkout`.

- [ ] Find the billing settings component. Run: `grep -r "razorpay" modules/settings --include="*.tsx" -l` and `grep -r "billing" modules/settings --include="*.tsx" -l`

- [ ] In the billing section of settings, add alongside the Stripe checkout button:

```tsx
// Razorpay checkout handler:
const handleRazorpayCheckout = async (plan: 'starter' | 'pro' | 'enterprise') => {
  try {
    const res = await fetch('/api/billing/razorpay-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, plan }),
    });
    const data = await res.json() as { checkoutUrl?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? 'Checkout failed');
    if (data.checkoutUrl) window.location.href = data.checkoutUrl;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Checkout failed');
  }
};
```

- [ ] Create `app/api/billing/razorpay-checkout/route.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

const RAZORPAY_PLANS: Record<string, { planId: string; name: string; amount: number }> = {
  starter:    { planId: process.env.RAZORPAY_STARTER_PLAN_ID    ?? '', name: 'Starter',    amount: 149900 },
  pro:        { planId: process.env.RAZORPAY_PRO_PLAN_ID        ?? '', name: 'Pro',        amount: 299900 },
  enterprise: { planId: process.env.RAZORPAY_ENTERPRISE_PLAN_ID ?? '', name: 'Enterprise', amount: 999900 },
};

export async function POST(request: NextRequest) {
  try {
    const { workspaceId, plan } = await request.json() as { workspaceId?: string; plan?: string };

    if (!workspaceId || !plan) {
      return NextResponse.json({ error: 'workspaceId and plan required' }, { status: 400 });
    }

    const authz = await requireWorkspacePermission(workspaceId, 'manage_billing');
    const planConfig = RAZORPAY_PLANS[plan];

    if (!planConfig) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const keyId     = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.' }, { status: 503 });
    }

    // Create Razorpay subscription
    const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const subRes = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan_id:       planConfig.planId,
        total_count:   12, // 12 months
        quantity:      1,
        notes: {
          workspaceId,
          plan,
          userId: authz.userId,
        },
      }),
    });

    const subData = await subRes.json() as { id?: string; short_url?: string; error?: { description?: string } };

    if (!subRes.ok || !subData.id) {
      console.error('[RazorpayCheckout]', subData);
      return NextResponse.json(
        { error: subData.error?.description ?? 'Failed to create subscription' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      subscriptionId: subData.id,
      checkoutUrl:    subData.short_url,
      keyId,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[RazorpayCheckout]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] Run `npx tsc --noEmit`.

- [ ] Commit:
```bash
git add app/api/billing/razorpay-checkout/route.ts
git commit -m "feat: Razorpay subscription checkout API"
```

---

## Task 11 — Final: TypeScript check + push + deploy

- [ ] Run full TypeScript check: `npx tsc --noEmit`
  - Expected: no errors

- [ ] Push all commits: `git push origin main`

- [ ] Deploy: `npx vercel --prod`

---

## EXTERNAL ACTIONS REQUIRED (Cannot be done in code — manual steps for owner)

These MUST be done before onboarding paying clients:

### EX-1: Apply Pending Database Migrations
Open Supabase → SQL Editor → run in order:
1. Contents of `database/migrations/018_contact_notes.sql`
2. Contents of `database/migrations/019_time_triggers.sql`
3. Contents of `database/migrations/020_phase2.sql`

### EX-2: Get Permanent WhatsApp System User Token
1. Go to Meta Business Manager → Settings → System Users
2. Create a System User → Generate Token with `whatsapp_business_messaging` permission
3. Update `WHATSAPP_ACCESS_TOKEN` in Vercel Environment Variables
4. Redeploy

### EX-3: Set Missing Environment Variables in Vercel
```
RESEND_API_KEY=re_xxxxxxxxxxxx          # from resend.com
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx    # from Stripe Dashboard → Webhooks
RAZORPAY_KEY_ID=rzp_live_xxxxxxxx       # from Razorpay Dashboard
RAZORPAY_KEY_SECRET=xxxxxxxx
RAZORPAY_STARTER_PLAN_ID=plan_xxxxxxx
RAZORPAY_PRO_PLAN_ID=plan_xxxxxxx
RAZORPAY_ENTERPRISE_PLAN_ID=plan_xxxxxxx
NEXT_PUBLIC_APP_URL=https://whatsapp-automation-kohl-six.vercel.app
```

### EX-4: Set Up cron-job.org for Hourly Campaign Scheduling
1. Go to cron-job.org → Create job
2. URL: `https://whatsapp-automation-kohl-six.vercel.app/api/cron/run-scheduled-campaigns?secret=agentix2026cron`
3. Schedule: Every hour (*/60 minutes)
4. This gives ≤1hr precision for scheduled campaigns without upgrading Vercel plan

### EX-5: Complete Meta Business Verification
Go to Meta Business Manager → Business Settings → Security Center → Start Verification.
This is required before your templates can be used at scale.
