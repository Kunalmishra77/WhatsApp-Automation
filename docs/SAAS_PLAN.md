# Agentix — Complete SaaS Multi-Tenant Product Plan
**Last Updated:** 2026-06-02  
**Stack:** Next.js 16 + Supabase + Vercel + Razorpay + OpenRouter  
**Live URL:** https://whatsapp-automation-kohl-six.vercel.app  
**GitHub:** https://github.com/Kunalmishra77/WhatsApp-Automation  

---

## PRODUCT VISION

Agentix ek **SaaS WhatsApp CRM platform** hai jo hum **multiple businesses ko sell karenge**.

- **Ek server** (Vercel) → sab clients use karein
- **Ek database** (Supabase) → har client ka data isolated
- **Super Admin Dashboard** → hum sab clients manage karein
- **Client Dashboard** → har client sirf apna data dekhe
- **URL:** Sab clients same URL pe login karein → `app.agentix.in`
- **Custom Domain:** Enterprise clients ko apna domain milega (e.g. `crm.sharmamedical.com`)
- **Free Trial:** NAHI — seedha paid plans only

---

## PLAN STRUCTURE — No Unlimited Anywhere

### STARTER — ₹1,499/month
**Target:** Small businesses — kiryana, medical store, single person

| Limit | Value |
|-------|-------|
| Agents (team members) | 2 |
| Messages/month | 3,000 |
| Contacts | 1,000 |
| Campaigns/month | 5 |
| Knowledge Base entries | 30 |
| Chatbot Flows | 3 |
| Analytics history | 7 days |
| API Access | ❌ |

**Features included:**
- ✅ WhatsApp conversations inbox
- ✅ Basic AI auto-reply
- ✅ Contact management
- ✅ Message templates (send only, no create)
- ✅ Basic campaigns (5/month)
- ✅ Quick replies
- ✅ Business hours auto-message
- ✅ Basic analytics (7 days)
- ❌ CRM / Leads
- ❌ AI Lead Scoring
- ❌ Vision AI (image understanding)
- ❌ SLA Management
- ❌ Flow Builder
- ❌ CSAT
- ❌ Custom Contact Fields
- ❌ Sentiment Dashboard
- ❌ A/B Testing
- ❌ Team Workload Balancer
- ❌ Semantic Search (pgvector)
- ❌ API Access
- ❌ Custom Domain

---

### PRO — ₹2,999/month
**Target:** Growing businesses — coaching, clinic, e-commerce, agency

| Limit | Value |
|-------|-------|
| Agents (team members) | 10 |
| Messages/month | 25,000 |
| Contacts | 10,000 |
| Campaigns/month | 50 |
| Knowledge Base entries | 500 |
| Chatbot Flows | 20 |
| Analytics history | 90 days |
| API Access | Limited (100 calls/day) |

**Features included (everything in Starter, plus):**
- ✅ Template creation + Meta submission
- ✅ CRM Pipeline (Kanban with drag-drop)
- ✅ AI Lead Scoring (0-100)
- ✅ Lead Temperature (Hot/Warm/Cold — AI auto-detect)
- ✅ Contact Lifecycle Stages
- ✅ Vision AI (GPT-4o image understanding)
- ✅ Chatbot Flow Builder (20 flows)
- ✅ Automation Templates Library
- ✅ Conditional Branching in Flows
- ✅ SLA Management
- ✅ CSAT (rating collection)
- ✅ Follow-up Sequences
- ✅ Inbox Rules
- ✅ Custom Contact Fields
- ✅ Contact Notes
- ✅ Sentiment Dashboard
- ✅ Session Pause/Resume (bot control)
- ✅ Chat Summarization (AI)
- ✅ A/B Testing for Campaigns
- ✅ Campaign Analytics (90 days)
- ✅ Conversation Labels
- ✅ QR Code Generator
- ✅ Analytics — full 90 days
- ✅ Async Campaign Queue
- ✅ Media Library
- ✅ API Access (limited)
- ❌ Custom Domain
- ❌ White Label
- ❌ Team Workload Balancer
- ❌ Semantic Search (pgvector)
- ❌ Daily Digest Email
- ❌ Dual LLM Model Selection

---

### ENTERPRISE — ₹9,999/month
**Target:** Large businesses, agencies, multi-branch — retail chains, hospitals, institutes

| Limit | Value |
|-------|-------|
| Agents (team members) | 25 |
| Messages/month | 1,00,000 |
| Contacts | 50,000 |
| Campaigns/month | 200 |
| Knowledge Base entries | 2,000 |
| Chatbot Flows | 50 |
| Analytics history | 1 year |
| API Access | Full (1000 calls/day) |

**Features included (everything in Pro, plus):**
- ✅ Custom Domain (e.g. crm.yourbusiness.com)
- ✅ White Label (remove Agentix branding)
- ✅ Brand Color customization
- ✅ Team Workload Balancer
- ✅ Smart Auto-Assignment (AI assigns to right agent)
- ✅ Semantic Search (pgvector — better AI answers)
- ✅ Daily Digest Email (morning metrics email)
- ✅ Dual LLM Model Selection (choose GPT/Groq/Claude)
- ✅ Conversation Merge
- ✅ Revenue Attribution (link orders to conversations)
- ✅ VIP Contact Rules
- ✅ Web Chat Widget (embed on website)
- ✅ Instagram DM + FB Messenger (multi-channel)
- ✅ Full API Access (1000 calls/day)
- ✅ Priority WhatsApp Support (24/7)
- ✅ Dedicated onboarding call

---

## URL STRUCTURE (Confirmed)

```
DEFAULT (all plans):
  All clients → app.agentix.in (single URL, separate accounts)
  Login with: email + password

ENTERPRISE ONLY:
  Custom domain option
  Client sets CNAME → agentix-cname.vercel.app
  Admin adds domain in Super Admin panel
  SSL auto-managed by Vercel
```

---

## WHAT IS ALREADY BUILT ✅

### Phase 1 — Core Platform (COMPLETE)
- Auth (Supabase — login, signup, forgot password)
- Multi-workspace support with RLS (Row Level Security)
- Role-based permissions (super_admin, admin, manager, agent)
- Realtime subscriptions

### Phase 1 Features (COMPLETE)
- Conversations inbox with all status tabs
- Agent assignment + resolve + labels
- Blue tick read receipts
- Templates (create, submit to Meta, media headers, buttons)
- Campaigns (wizard, media, schedule, live stats, CSV export)
- ChatBot Flow Builder (ReactFlow — all node types including condition/branching)
- CRM Pipeline (Kanban drag-drop)
- Knowledge Base (CRUD, AI generate, templates)
- Analytics (10 metric cards, charts, heatmap, team performance, CSAT)
- CSAT (auto-send on resolve, webhook detect reply)
- SLA Management (policies, breach detection cron)
- Shopify integration
- Outbound webhooks (Zapier/n8n compatible)
- Public REST API v1
- Audit Logs
- Rate limiting (Upstash Redis)
- Business Hours (away message)
- Contact import CSV
- Global Search ⌘K
- Quick Replies
- Internal Notes
- Opt-out / Opt-in detection
- Media send (image/video/audio/document)
- Suggested Replies (AI)
- Auto-translate (multilingual)
- Escalation detection (keyword + AI sentiment)
- Auto-categorization (non-blocking)
- Order Status Bot

### Phase 2 Features (COMPLETE)
- Contact Notes (sticky notes per contact)
- Session Pause/Resume (bot_paused toggle)
- Custom Contact Fields (definitions + settings UI + panel)
- Lead Temperature (Hot/Warm/Cold — now AI auto-detect from message)
- Chat Summarization (AI summary button + popover)
- Vision AI (GPT-4o-mini image understanding in webhook)
- Automation Templates Library (7 pre-built flow templates)
- Conditional Branching (ConditionNode Yes/No)
- Time-Based Automation Triggers (idle-close cron + settings UI)
- AI Lead Scoring (0-100 formula, LeadDetail button)
- Smart Auto-Assignment (workload + expertise routing)
- Broadcast A/B Testing (wizard toggle + 2 linked campaigns)
- Contact Lifecycle Stages (lead/prospect/customer/churned)
- VIP Contact Rules (star toggle + webhook bot bypass)
- Team Workload Balancer (per-agent bars + auto-balance button)
- Revenue Attribution (orders.conversation_id + panel)
- QR Code Generator (api.qrserver.com + Settings page)
- Daily Digest Email (Resend REST + cron)
- Conversation Merge (move messages + resolve secondary)
- Sentiment Dashboard (live dot on ConversationItem)

### Phase 3 Features (COMPLETE)
- Dual LLM Routing (ai-router.ts + per-task model selector)
- Async Campaign Queue (>50 contacts queued, daily cron)
- Semantic Search / pgvector (OpenAI embeddings, cosine similarity, match_knowledge_base RPC)
- Web Chat Widget (/widget/[workspaceId] embeddable iframe)
- White Label / Branding (brand_color, custom_domain, embed code)
- Stripe Billing routes (kept as fallback)
- Razorpay Subscriptions Billing (checkout + webhook handler)
- Instagram DM + FB Messenger (/api/webhooks/meta)
- AI Auto-Lead Creation (keyword-based temperature from webhook)
- Campaign Duration Tracking (started_at → completed_at cards)
- Media Library (Supabase Storage upload → public URL)
- Enhanced Campaign CSV Export (includes lead stage + temperature + value)
- Lead Temperature visible on all leads (Lucide icons: Flame/Thermometer/Snowflake)
- CRM Temperature filter pills (All/Hot/Warm/Cold)

---

## DB MIGRATIONS APPLIED (Supabase)

| Migration | Status |
|-----------|--------|
| 001 — auth + workspace | ✅ Applied |
| 002 — core domain | ✅ Applied |
| 003–017 — all features | ✅ Applied |
| 018 — contact_notes, bot_paused, ai_summary, temperature, custom_fields | ✅ Applied |
| 019 — time_trigger_queue, workspace_time_trigger_config | ✅ Applied |
| 020 — lifecycle_stage, is_vip, sentiment, ai_score, conversation_id, expertise_tags, ab_test_group | ✅ Applied |
| 021 — pgvector, campaign_queue, billing columns, branding columns | ✅ Applied |

---

## ENV VARS (ALL Set in Vercel + .env.local)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_WABA_ID
WHATSAPP_ACCESS_TOKEN
WHATSAPP_WEBHOOK_SECRET
META_APP_SECRET
OPENAI_API_KEY
OPENROUTER_API_KEY
AI_MODEL
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
RESEND_API_KEY
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_PRO_PLAN_ID          = plan_8wjaaQy4RfiCa8
RAZORPAY_ENTERPRISE_PLAN_ID   = plan_8wjdzkbg49NeD9
RAZORPAY_WEBHOOK_SECRET       = Indresh@9125
NEXT_PUBLIC_APP_URL
```

---

## WHAT NEEDS TO BE BUILT — SaaS Multi-Tenant

### PHASE 4 — SaaS Infrastructure (PENDING — build next)

#### 4.1 Platform Super Admin Dashboard (`/admin`)
- Protected route: only accessible to `is_platform_admin = true` profiles
- Page: `/admin` — list all workspaces (clients)
- Per workspace: name, owner email, plan, messages used/limit, last active, status
- Actions per client: View their dashboard (impersonate), Change plan, Block/Unblock, Delete
- Platform stats: Total clients, MRR, active subscriptions, messages sent today
- Revenue table: per client billing history

**Files to create:**
- `app/(admin)/admin/page.tsx` — Super Admin dashboard
- `app/(admin)/admin/layout.tsx` — Layout with admin guard
- `app/api/admin/workspaces/route.ts` — GET all workspaces with stats
- `app/api/admin/workspaces/[id]/route.ts` — PATCH plan/status, GET details
- `app/api/admin/stats/route.ts` — Platform-level aggregated stats
- `modules/admin/components/AdminDashboard/index.tsx`
- `modules/admin/components/ClientList/index.tsx`
- `modules/admin/components/ClientDetail/index.tsx`

**DB Migration needed:**
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN DEFAULT false;
-- Set your account: UPDATE profiles SET is_platform_admin = true WHERE email = 'your@email.com';

CREATE TABLE IF NOT EXISTS platform_usage_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  month         VARCHAR(7) NOT NULL,  -- '2026-06'
  messages_sent INTEGER DEFAULT 0,
  messages_in   INTEGER DEFAULT 0,
  campaigns_run INTEGER DEFAULT 0,
  contacts_created INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, month)
);
```

#### 4.2 Usage Tracking + Plan Limits Enforcement
- Track messages sent per workspace per month in `platform_usage_logs`
- Check limits before allowing: auto-reply, campaign send, contact create
- API middleware: `lib/plan-guard.ts` — check workspace plan limits
- Dashboard: usage bar per feature (messages X/3000, contacts X/1000)
- Warning email at 80% usage (via Resend)
- Block at 100% with upgrade prompt

**Files to create:**
- `lib/plan-guard.ts` — check and enforce plan limits
- `lib/usage-tracker.ts` — increment usage counters
- `app/api/billing/usage/route.ts` — GET current month usage
- Update webhook to check message limit before auto-reply
- Update campaign run to check campaign limit

#### 4.3 Client Self-Onboarding (New Account Creation)
- `/signup` already exists for auth
- Add onboarding wizard after first login:
  - Step 1: Business name, industry, phone
  - Step 2: WhatsApp API credentials (phone_number_id, access_token)
  - Step 3: Test connection (send test message to their number)
  - Step 4: Choose plan → Razorpay payment
  - Step 5: Welcome — dashboard live!
- Track onboarding completion: `workspaces.onboarding_complete BOOLEAN`
- Show "Complete Setup" bar until all steps done

**Files to create:**
- `app/(onboarding)/onboarding/page.tsx` — Multi-step wizard
- `app/api/onboarding/test-connection/route.ts` — Test WhatsApp credentials
- `app/api/onboarding/complete/route.ts` — Mark onboarding done

#### 4.4 Admin Creates Client Manually (Current Preferred Flow)
- Super Admin dashboard → "Add New Client" button
- Form: Business name, owner email, phone, plan
- System: Create workspace → Create user account → Send invite email via Resend
- Client receives email: "Your Agentix account is ready" with login link

**Files to create:**
- `app/api/admin/create-client/route.ts` — Create workspace + user + send invite
- `modules/admin/components/CreateClientModal/index.tsx`

#### 4.5 Usage Display in Client Dashboard
- Settings → Billing → show current month usage vs plan limits
- Progress bars: Messages (2,450/3,000), Contacts (847/1,000), Campaigns (3/5)
- Upgrade button when near/at limit

**Files to update:**
- `modules/settings/components/BillingSettings/index.tsx` — Add usage display
- `app/api/billing/usage/route.ts` — NEW: return current usage stats

#### 4.6 Feature Gating Per Plan
Every feature checks workspace plan before allowing:

```
Starter blocks: CRM, Lead Scoring, Vision AI, SLA, Flows, CSAT, API
Pro blocks: Custom Domain, White Label, Workload Balancer, Semantic Search
Enterprise: all features available

Implementation:
- lib/plan-guard.ts exports: canUseCRM(plan), canUseVisionAI(plan), etc.
- Sidebar navigation: locked features show lock icon + upgrade tooltip
- API routes: check plan before processing
```

**Files to create:**
- `lib/plan-features.ts` — Feature flags per plan (which plan unlocks what)
- Update sidebar to show locked items with lock icon

#### 4.7 Auto-Payment Failure → Auto-Disconnection (Razorpay Subscriptions)

**Goal:** Agar client renewal payment fail ho toh humein manually kuch nahi karna — system automatically access band kar de, aur jab pay kare toh automatically on ho jaye.

**Razorpay Subscription Webhook Events — ye already `/api/billing/razorpay-webhook` pe aate hain:**

| Event | Matlab | Action |
|-------|--------|--------|
| `subscription.charged` | Payment success | `is_active = true`, `subscription_status = active`, next_billing_date update karo |
| `subscription.payment.failed` | Ek attempt fail hua | Warning email bhejo, workspace active raho (Razorpay khud 3 baar retry karta hai) |
| `subscription.halted` | Sab retries fail — payment nahi aaya | `is_active = false`, `subscription_status = halted` → access band |
| `subscription.cancelled` | Client ya hum ne cancel kiya | `is_active = false`, `subscription_status = cancelled` |
| `subscription.completed` | Subscription period khatam | `is_active = false`, `subscription_status = expired` |
| `subscription.activated` | Naya subscription shuru | `is_active = true`, plan activate karo |

**Razorpay automatic retry behavior:**
```
Day 0: Payment due → 1st attempt
Day 3: Retry 1 (agar fail hua)
Day 6: Retry 2
Day 9: Retry 3 → agar bhi fail → subscription.halted event aata hai
```
**Hume sirf `subscription.halted` pe react karna hai — Razorpay retries khud karta hai.**

**What happens when `is_active = false`:**
- Client login karne ki koshish kare → `PaymentRequiredScreen` dikhe (not a real logout, just a wall)
- Screen pe dikhe: "Your subscription payment failed. Please update your payment method."
- Razorpay payment link dikhe (hosted page link)
- Data delete nahi hoga — sirf access band
- Incoming WhatsApp messages save hote rahein (queue) — access open hone pe dikhe
- Campaigns, auto-reply, flows — sab band

**When payment succeeds (`subscription.charged` event):**
- `is_active = true` → access turant restore
- Client ko email: "Payment received, access restored"

**Files to update:**
- `app/api/billing/razorpay-webhook/route.ts` — Add handlers for `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `subscription.charged`
- `middleware.ts` — Check `is_active` before allowing dashboard access; redirect to `/payment-required` if false
- `app/(auth)/payment-required/page.tsx` — NEW: Payment wall screen with Razorpay link

**Files to create:**
- `app/(auth)/payment-required/page.tsx` — Payment required wall page

**DB columns needed (already in Migration 022):**
```sql
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active',
  -- values: active | halted | cancelled | expired | trialing
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS next_billing_date DATE,
  ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMPTZ;
```

**Webhook handler logic (pseudocode):**
```typescript
// In razorpay-webhook/route.ts

case 'subscription.halted':
  await db.workspaces.update({
    is_active: false,
    subscription_status: 'halted',
    payment_failed_at: new Date(),
  }).where({ razorpay_subscription_id: subscriptionId });
  // Email client: "Payment failed, please update card"
  await sendEmail(ownerEmail, 'payment-failed-template');
  break;

case 'subscription.charged':
  await db.workspaces.update({
    is_active: true,
    subscription_status: 'active',
    payment_failed_at: null,
    next_billing_date: nextBillingDate,
  }).where({ razorpay_subscription_id: subscriptionId });
  // Email client: "Payment received, access restored"
  await sendEmail(ownerEmail, 'payment-success-template');
  break;

case 'subscription.cancelled':
case 'subscription.completed':
  await db.workspaces.update({
    is_active: false,
    subscription_status: event === 'subscription.cancelled' ? 'cancelled' : 'expired',
  }).where({ razorpay_subscription_id: subscriptionId });
  break;

case 'subscription.payment.failed':
  // Single attempt fail — just send warning, don't block yet
  await sendEmail(ownerEmail, 'payment-retry-warning-template');
  break;
```

**Middleware check:**
```typescript
// middleware.ts — add this check for /dashboard routes
const workspace = await getWorkspace(workspaceId);
if (!workspace.is_active && !profile.is_platform_admin) {
  return NextResponse.redirect('/payment-required');
}
```

**Payment Required Screen (`/payment-required`):**
```
┌─────────────────────────────────────────────────────┐
│              ⚠️ Subscription Payment Failed          │
│                                                      │
│  Your Agentix subscription payment could not be     │
│  processed. Your account has been paused.           │
│                                                      │
│  Your data is safe — no data was deleted.           │
│                                                      │
│  [💳 Update Payment Method & Reactivate]            │
│     (links to Razorpay hosted page)                 │
│                                                      │
│  Questions? WhatsApp us: +91-XXXXXXXXXX             │
└─────────────────────────────────────────────────────┘
```

**Super Admin override:**
- Admin can manually set `is_active = true` from Super Admin panel (grace period / exception)
- Admin can see all `halted` workspaces in a separate tab with total lost MRR

---

### PHASE 5 — Polish & Scale (After Phase 4)

#### 5.1 Landing Page
- `app/(landing)/page.tsx` — Public marketing page
- Pricing section (3 plans, no free trial, "Contact Sales" for Enterprise)
- Features section
- How it works
- Testimonials placeholder
- CTA: "Get Started for ₹1,499/mo"

#### 5.2 Custom Domain Setup (Enterprise)
- Admin panel: add client's custom domain
- Middleware (`middleware.ts`): detect custom domain → load correct workspace
- Instructions page: "How to set CNAME" for client

#### 5.3 Client Invite Email Template
- Professional email via Resend
- "Welcome to Agentix — Your account is ready"
- Direct login link
- Setup guide link

---

## PLAN FEATURE MAP (for lib/plan-features.ts)

```typescript
export const PLAN_FEATURES = {
  starter: {
    maxAgents: 2,
    maxMessages: 3000,
    maxContacts: 1000,
    maxCampaigns: 5,
    maxKbEntries: 30,
    maxFlows: 3,
    analyticsHistory: 7,
    apiCallsPerDay: 0,
    features: [
      'conversations', 'contacts', 'templates_send', 'campaigns_basic',
      'quick_replies', 'business_hours', 'analytics_basic', 'media_send',
      'auto_reply_basic', 'opt_out_detection',
    ],
  },
  pro: {
    maxAgents: 10,
    maxMessages: 25000,
    maxContacts: 10000,
    maxCampaigns: 50,
    maxKbEntries: 500,
    maxFlows: 20,
    analyticsHistory: 90,
    apiCallsPerDay: 100,
    features: [
      // All starter features +
      'templates_create', 'crm', 'lead_scoring', 'lead_temperature',
      'contact_lifecycle', 'vision_ai', 'flows', 'flow_templates',
      'flow_branching', 'sla', 'csat', 'follow_up_sequences',
      'inbox_rules', 'custom_fields', 'contact_notes', 'sentiment',
      'session_pause', 'chat_summary', 'ab_testing', 'campaign_analytics',
      'labels', 'qr_code', 'async_campaigns', 'media_library',
      'api_limited', 'contact_import', 'global_search', 'audit_logs',
    ],
  },
  enterprise: {
    maxAgents: 25,
    maxMessages: 100000,
    maxContacts: 50000,
    maxCampaigns: 200,
    maxKbEntries: 2000,
    maxFlows: 50,
    analyticsHistory: 365,
    apiCallsPerDay: 1000,
    features: [
      // All pro features +
      'custom_domain', 'white_label', 'brand_color',
      'workload_balancer', 'smart_auto_assign', 'semantic_search',
      'daily_digest', 'dual_llm', 'conversation_merge',
      'revenue_attribution', 'vip_contacts', 'web_widget',
      'instagram_messenger', 'api_full', 'priority_support',
    ],
  },
};
```

---

## SUPER ADMIN PANEL — Required Columns

```sql
-- Run in Supabase (Migration 022):

-- 1. Platform admin flag
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN DEFAULT false;

-- 2. Set Indresh as platform admin (run after migration):
-- UPDATE profiles SET is_platform_admin = true WHERE email = 'aiagentix2025@gmail.com';

-- 3. Workspace status + onboarding
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS industry VARCHAR(100);

-- 4. Usage tracking table
CREATE TABLE IF NOT EXISTS platform_usage_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  month            VARCHAR(7) NOT NULL,  -- format: '2026-06'
  messages_sent    INTEGER NOT NULL DEFAULT 0,
  messages_in      INTEGER NOT NULL DEFAULT 0,
  campaigns_run    INTEGER NOT NULL DEFAULT 0,
  contacts_created INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, month)
);
CREATE INDEX IF NOT EXISTS pul_workspace_month ON platform_usage_logs (workspace_id, month);
```

---

## HOW TO CONTINUE THIS WORK IN NEXT CHAT

### Tell the next chat:
```
"Continue building Agentix SaaS. Read docs/SAAS_PLAN.md for full context.
Current status: Phase 1+2+3 complete. Need to build Phase 4.
Start with: 4.1 Super Admin Dashboard + 4.2 Usage Tracking + 4.6 Plan Feature Gating.
Then: 4.3 Client Onboarding Wizard + 4.4 Admin creates client manually.
Also include: 4.7 Auto-payment failure → auto-disconnection (Razorpay subscription.halted webhook + middleware wall + /payment-required page)."
```

### Key files to read first:
1. `docs/SAAS_PLAN.md` — this file (full plan)
2. `docs/ROADMAP.md` — what's built
3. `database/migrations/` — DB schema
4. `modules/settings/components/SettingsLayout/index.tsx` — settings pattern
5. `app/api/settings/workspace/route.ts` — workspace API pattern
6. `lib/authz.ts` — permission system

### Important patterns in codebase:
- API routes: GET uses `request.nextUrl.searchParams.get('workspaceId')`
- POST/PATCH: workspaceId from `request.json()`
- Auth: `requireWorkspacePermission(workspaceId, 'permission_name')`
- Admin DB: `createAdminClient() as any` (bypass RLS)
- All DB writes via admin client

---

## CRON JOBS (External — cron-job.org triggers these daily)
```
GET /api/cron/run-scheduled-campaigns?secret=agentix2026cron
GET /api/cron/process-follow-up-sequences?secret=agentix2026cron
GET /api/cron/check-sla-breaches?secret=agentix2026cron
GET /api/cron/time-triggers?secret=agentix2026cron
GET /api/cron/daily-digest?secret=agentix2026cron
GET /api/cron/process-campaign-queue?secret=agentix2026cron
```

---

## RAZORPAY SETUP (DONE)
- Pro Plan ID: `plan_8wjaaQy4RfiCa8`  
- Enterprise Plan ID: `plan_8wjdzkbg49NeD9`
- Webhook URL: `https://whatsapp-automation-kohl-six.vercel.app/api/billing/razorpay-webhook`
- Webhook Secret: stored in Vercel as `RAZORPAY_WEBHOOK_SECRET`

---

*This document was last updated: 2026-06-02. All Phase 1, 2, 3 features are built and deployed.*
