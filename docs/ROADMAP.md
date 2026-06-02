# Agentix — Complete Feature Roadmap

**Project:** WhatsApp Business Automation SaaS  
**Stack:** Next.js 16 + Supabase + Meta WhatsApp Cloud API + OpenRouter AI  
**Live:** https://whatsapp-automation-kohl-six.vercel.app  
**GitHub:** https://github.com/Kunalmishra77/WhatsApp-Automation  
**Last Updated:** 2026-06-02  

---

## What Is Built (Complete ✅)

### Core Platform
- Auth (Supabase Auth — login, signup, forgot password, email verify)
- Multi-workspace support with RLS
- Role-based permissions (super_admin, admin, manager, agent)
- Realtime subscriptions (Supabase Realtime)
- Sidebar nav: Conversations, Contacts, CRM, Campaigns, Templates, Flows, Team, Analytics, Knowledge Base, Settings

### Conversations
- Inbox with realtime, search, status tabs (all/open/assigned/pending/resolved/mine)
- Agent assignment + status change + resolve
- Blue tick read receipts (WhatsApp API mark-as-read)
- ConversationHeader with: assign dropdown, status change, resolve button, panel toggle
- Customer 360 panel (right sidebar) — contact info, orders, conversations, CSAT
- Conversation Labels (tag conversations: Sales/Support/etc.) — Settings → Automation → Labels
- Label picker popover in ConversationHeader

### Messaging
- Agent chat with media send (image/video/audio/document/PDF)
- Quick replies (saved canned responses)
- Interactive messages (buttons, lists)
- Internal notes
- Message types displayed: text, image, video, audio, document, location, sticker
- Auto-reply (AI-powered, KB-aware, OpenRouter GPT)
- Media auto-reply (contextual AI for image/video/audio — not just "[Image]")
- Opt-out / Opt-in (STOP/START detection in webhook)
- Message search via ⌘K global search

### Templates
- Template CRUD + Meta submission
- Header types: NONE / TEXT / IMAGE / VIDEO / DOCUMENT (with file upload to WhatsApp)
- Buttons builder: QUICK_REPLY / URL / PHONE_NUMBER (max 3)
- Live preview (WhatsAppPreview component)
- Template sync from Meta

### Campaigns
- Campaign wizard: Name → Template → Audience → Schedule → Media → Review
- Template OR media optional (media-only campaigns supported)
- Media attachment (optional image/video after template)
- Campaign executor: per-recipient rows, whatsapp_msg_id tracking
- Campaign detail page /campaigns/[id]: stats cards, funnel bars, recipient table with filter tabs
- Per-recipient status: sent/delivered/read/replied/failed
- Webhook mirrors delivery/read to campaign_recipients
- Campaign list: live stats from campaign_recipients (not stale columns), delete button
- CSV export

### Templates & Chatbot Flows
- ChatBot Flow Builder (ReactFlow visual): trigger → message → condition → wait → assign → end
- Flow sessions (per-contact state machine)
- Flow CRUD + deploy

### Inbox Rules
- Rule engine: conditions (keyword, sender, time) → actions (assign, label, close, reply)
- Settings UI

### Automation
- Follow-up drip sequences (multi-step timed)
- Cron job: process-follow-up-sequences (every 5 min via vercel.json + cron-job.org)

### CRM & Sales
- CRM Pipeline (drag-drop Kanban with @dnd-kit)
- Follow-up Sequences
- Payment links (Razorpay)
- Product catalog (WhatsApp interactive product messages)
- Order Status Bot (regex detection → auto-reply with order status)

### AI Features
- AI escalation detection (keyword + sentiment → agent alert)
- Smart suggested replies (Sparkles button in MessageInput)
- Auto-categorization (non-blocking label on inbound)
- Multi-language auto-translate (Translate toggle in MessageBubble)
- Knowledge Base (upload, AI generate, templates, CRUD)
- KB context injected into AI auto-reply (keyword scoring)

### Analytics (Full Rebuild)
- 10 clickable summary cards with detail drawers (Sheet)
- Daily activity line chart (inbound/outbound/delivered/new contacts)
- Message sources pie chart
- Conversations by status bar chart (clickable bars)
- Resolution time distribution bar chart
- Inbound activity heatmap (7×24 day×hour grid)
- Contact tag distribution horizontal bar chart
- Top 10 active contacts
- Team performance table (sent, assigned, resolved, avg response, CSAT)
- Date range selector (7d / 30d / 90d)
- CSV export
- Avg Response Time (real calculation from first_replied_at)

### Analytics Detail Drawers
- Open/resolved/pending conversations → list with last msg, SLA badge, click to open
- New contacts → with conversation count, tags
- CSAT → score distribution bars + avg + individual cards
- Inbound/outbound messages → content, contact, click to open conversation
- Delivery breakdown → stat cards + progress bars

### CSAT
- Auto-sent on conversation resolve (WhatsApp text with 1-5 rating prompt)
- Webhook detects 1-5 reply → saves score, sends thank-you
- Analytics: avg score card + CSAT drawer

### SLA Management
- sla_policies table per workspace
- First response hours + resolution hours
- Breach detection cron (GET /api/cron/check-sla-breaches)
- Breach flags on conversations (sla_first_breach, sla_resolve_breach)
- SLA Settings UI

### Integrations
- Shopify: order confirmed/abandoned cart/shipping webhooks
- Outbound webhooks (Zapier/n8n compatible, HMAC signed)
- Public REST API v1 (contacts, conversations, messages, templates, broadcasts)
- API key management (hashed storage)

### Settings (Vertical Left-Nav)
- Account: Profile, Workspace
- WhatsApp: Configuration, Business Hours, Quick Replies
- Automation: Inbox Rules, Follow-Up, SLA, Labels
- Integrations: Integrations, Webhooks, API Keys
- Admin: Audit Logs

### Other
- Audit logs (activity trail with CSV export)
- Rate limiting (Upstash Redis)
- Business Hours (away message when closed)
- Contact import CSV (PapaParse, with preview)
- Global Search ⌘K (contacts, conversations, messages — live debounced)
- Knowledge Base page (top-level sidebar)
- Opt-out management (STOP/START)

### DB Migrations Applied
- 001 — auth + workspace
- 002 — core domain (contacts, conversations, messages, templates, campaigns)
- 003 — security + realtime queue
- 004 — inbox_rules
- 005 — chatbot_flows + flow_sessions
- 006 — csat_responses
- 007 — follow_up_sequences + contact_sequences
- 008 — orders
- 009 — knowledge_base
- 010 — kb_enterprise
- 011 — outbound_webhooks
- 012 — quick_replies
- 013 — business_hours
- 014 — api_keys
- 015 — sla_policies + conversations SLA columns
- 016 — campaign_recipients + campaigns.media_id/media_type
- 017 — workspace_labels (Supabase: run manually)
- 018 — contact_notes + bot_paused + ai_summary + lead_temperature + custom_field_definitions (run manually)
- 019 — time_trigger_queue + workspace_time_trigger_config (run manually)

---

## PHASE 1 — Gap Fill ✅ COMPLETE (2026-06-02)
**Goal:** Features that reference projects have, we don't. All 9 features built.

### 1.1 Contact Notes
**What:** Sticky notes per contact, separate from conversations
**Files:**
- Migration: `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT[] DEFAULT '{}'` (or separate `contact_notes` table)
- API: `POST /api/contacts/[id]/notes` + `DELETE /api/contacts/[id]/notes/[noteId]`
- UI: `modules/contacts/components/ContactNotes/index.tsx` — note list + add form
- Wire into ContactDetail right panel
**Data:** `contact_notes(id, contact_id, workspace_id, content TEXT, created_by UUID, created_at)`

### 1.2 Session Pause / Resume
**What:** Bot auto-reply ko temporarily pause karo for a specific conversation. Agent handles, then resume.
**Files:**
- Migration: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bot_paused BOOLEAN DEFAULT false`
- API: `PATCH /api/conversations/[id]/bot-pause` — toggle bot_paused
- Webhook: In handleIncomingMessage → if `conversation.bot_paused = true` → skip all AI/rule processing
- UI: Toggle button in ConversationHeader (robot icon — green=active, red=paused)
**Note:** When agent manually replies → optionally auto-pause

### 1.3 Custom Contact Fields UI
**What:** User-defined contact fields (Company Size, Industry, Plan Type etc.)
**DB:** `contacts.custom_fields JSONB DEFAULT '{}'` already exists  
**Files:**
- API: `GET/POST/DELETE /api/settings/custom-fields?workspaceId=` — define field schemas
- Migration: `custom_field_definitions(id, workspace_id, name, label, field_type TEXT, options JSONB)`
- UI: Settings → Account → Custom Fields — define fields
- UI: ContactDetail/ContactForm — render custom fields dynamically
- Wire: ContactForm to save custom_fields values

### 1.4 Lead Temperature
**What:** Hot / Warm / Cold classification on CRM leads
**DB:** `leads` table — add `temperature VARCHAR(10) DEFAULT 'warm'` (cold/warm/hot)
- Migration: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS temperature VARCHAR(10) DEFAULT 'warm'`
- UI: CRM card — colored dot (🔴 Hot / 🟡 Warm / 🔵 Cold) + dropdown to change
- Auto-suggest: Based on last activity date (no reply 7 days = cold, recent = warm, multiple replies = hot)
- API: `PATCH /api/leads/[id]` — include temperature field

### 1.5 Chat Summarization
**What:** LLM generates a 2-3 sentence summary of the conversation
**Files:**
- API: `POST /api/conversations/[id]/summarize` — fetch last N messages → send to OpenRouter → return summary
- Store: `conversations.ai_summary TEXT` — migration needed
- UI: ConversationHeader — "Summarize" button → shows summary in a popover
- Auto-trigger: On conversation resolve, auto-generate summary (non-blocking)
**Prompt:** "Summarize this WhatsApp conversation in 2-3 sentences. Include: main topic, resolution, any pending action items."

### 1.6 Vision AI (Image Understanding)
**What:** When contact sends image → AI actually describes/analyzes it (not just "User sent an image")
**Current:** `buildAiPrompt()` passes "User sent an image with caption: X" — AI doesn't see the image
**Fix:**
- In webhook `sendAutoReply()` → if message type is image → download image URL from Meta API → pass as base64 to OpenRouter vision model
- API: `GET https://graph.facebook.com/v19.0/{media_id}` → get URL → fetch image → base64
- Send to OpenRouter with: `{ role: 'user', content: [{ type: 'image_url', url: ... }, { type: 'text', text: 'Describe this image and respond helpfully' }] }`
- Model: `openai/gpt-4o-mini` (has vision, cheap)
**Files:** `app/api/webhooks/whatsapp/route.ts` — update `sendAutoReply()` + `buildAiPrompt()`

### 1.7 Automation Templates Library
**What:** Pre-built chatbot flow templates to choose from (Welcome, OOO, Lead Qualifier, etc.)
**Files:**
- `lib/flow-templates.ts` — 5-8 pre-built flow JSON objects
- API: `GET /api/flows/templates` — list templates
- UI: Flows list page → "New Flow" → shows template picker → creates flow from template
**Templates to build:**
  1. Welcome Message Flow
  2. Out of Office Flow
  3. Lead Qualifier (name, budget, timeline questions)
  4. Order Status Check Flow
  5. Support Ticket Flow
  6. FAQ Auto-responder Flow
  7. Appointment Booking Flow

### 1.8 Conditional Branching in Flows
**What:** Flow nodes can branch — Yes/No conditions based on: keyword match, contact tag, time of day, custom field value
**Current:** Flow has basic node types but no conditional branching UI
**Files:**
- Add `condition` node type to ReactFlow builder
- Condition node: has TWO output handles (yes/no)
- Condition types: keyword_match, has_tag, time_in_range, custom_field_equals, contact_has_value
- Flow executor: evaluate condition → follow yes or no path
- UI: New node type in sidebar, rendered as diamond shape
**DB:** No migration needed — flows already store as JSONB

### 1.9 Time-Based Automation Triggers
**What:** Flows/automations that fire on schedule or after a delay
**Types:**
  1. **Conversation idle for X hours** — no reply → trigger action
  2. **X hours after conversation created** — send follow-up
  3. **Daily at specific time** — broadcast or reminder
**Files:**
- Cron: Add to existing cron endpoints or new `GET /api/cron/time-triggers`
- DB: `time_trigger_queue(id, workspace_id, conversation_id, trigger_at TIMESTAMPTZ, action JSONB)`
- Conversation idle: On each incoming message → reset timer. Cron checks conversations with no activity for X hours.

---

## PHASE 2 — Agentix Exclusive (Not in any reference project)
**Goal:** Features that make Agentix BETTER than competition

### 2.1 AI Lead Scoring (0-100)
**What:** Automatic lead quality score based on: conversation sentiment, response speed, keywords, engagement count
**Formula:**
- Sentiment score (positive replies → +points)
- Engagement (how many messages) → +points
- Response time (replied fast → +points)
- Keywords (budget/buy/price/interested → +points)
- Recency (recent activity → +points)
**Files:**
- API: `POST /api/leads/[id]/score` → calculate and save
- DB: `leads.ai_score INTEGER DEFAULT NULL`
- UI: CRM card shows score badge (0-30 red, 31-70 amber, 71-100 green)
- Auto-run: After each conversation message involving a lead contact

### 2.2 Smart Auto-Assignment
**What:** AI assigns incoming conversations to the best available agent
**Logic:**
- Check which agents are online (workspaceStore tracks last_seen)
- Get each agent's current open conversation count (workload)
- Get each agent's expertise tags (from profile)
- Match contact's conversation topic → agent expertise
- Assign to agent with lowest load + matching expertise
**Files:**
- DB: `profiles.expertise_tags TEXT[] DEFAULT '{}'`
- API: `POST /api/conversations/[id]/smart-assign`
- UI: Settings → Workspace → Auto-Assignment toggle
- Trigger: On new conversation creation (in webhook)

### 2.3 Conversation Timeout Auto-close
**What:** Conversations with no activity for X hours → auto-resolve
**Files:**
- Settings: `workspace_settings.auto_close_hours INTEGER DEFAULT NULL` (null = disabled)
- Cron: `GET /api/cron/auto-close-conversations` (runs hourly)
- Logic: Find open conversations with `last_message_at < NOW() - interval 'X hours'` → resolve + send closure message
- UI: Settings → WhatsApp → "Auto-close after X hours of inactivity"

### 2.4 Broadcast A/B Testing
**What:** Create 2 versions of a campaign (A/B), split audience, compare performance
**Files:**
- DB: `campaigns.ab_test_group VARCHAR(1) DEFAULT NULL` (A or B), `campaigns.parent_campaign_id UUID`
- UI: Campaign wizard → "A/B Test" toggle → creates 2 campaigns with split audience
- Analytics: Side-by-side comparison chart (delivery%, read%, reply%)

### 2.5 Contact Lifecycle Stages
**What:** Lead → Prospect → Customer → Churned (like HubSpot)
**Files:**
- DB: `contacts.lifecycle_stage VARCHAR(20) DEFAULT 'lead'`
- Migration: `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(20) DEFAULT 'lead'`
- UI: ContactDetail header shows stage pill + click to change
- CRM view: Filter by lifecycle stage
- Automation trigger: "When lifecycle changes to X"

### 2.6 VIP Contact Rules
**What:** Mark specific contacts as VIP → priority queue, different bot behavior, instant agent alert
**Files:**
- DB: `contacts.is_vip BOOLEAN DEFAULT false`
- Migration: `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT false`
- Webhook: If contact.is_vip → skip rate limiting, skip bot (go straight to agent), create urgent notification
- UI: ContactDetail — VIP toggle (star icon)
- Conversation list: VIP conversations shown with ⭐ badge at top

### 2.7 Team Workload Balancer
**What:** Dashboard showing real-time agent conversation counts + auto-balance button
**Files:**
- API: `GET /api/team/workload?workspaceId=` — per-agent open conversation counts
- API: `POST /api/team/balance` — distribute unassigned conversations evenly
- UI: Team page → "Workload" tab → agent cards with conversation count bar charts + "Auto Balance" button

### 2.8 Revenue Attribution
**What:** Link payment to conversation — "This payment came from this WhatsApp chat"
**Files:**
- DB: `payments.conversation_id UUID REFERENCES conversations(id)` (already have payments table for Razorpay)
- UI: Conversation detail → "Link Payment" button → select from recent payments
- Analytics: Revenue per conversation, revenue per agent, revenue by campaign

### 2.9 QR Code Generator
**What:** Generate WhatsApp QR codes for marketing materials
**Files:**
- API: `GET /api/qr-code?phone=&message=&workspaceId=` → returns QR code image (use `qrcode` npm package)
- UI: Settings → WhatsApp → QR Code section → generate + download
- Also: Campaign-specific QR codes

### 2.10 Daily Digest Email
**What:** Every morning, automated email to workspace admins with:
  - Yesterday's messages (inbound/outbound)
  - Open conversations count
  - Resolved count
  - Avg CSAT score
  - Top agent by resolved count
**Files:**
- Cron: `GET /api/cron/daily-digest` (runs at 8:00 AM IST via cron-job.org)
- Email: Use Resend.com free tier (100 emails/day)
- Template: HTML email with metrics

### 2.11 Conversation Merge
**What:** Same contact has 2 conversations → merge into one
**Files:**
- API: `POST /api/conversations/merge` → `{ primaryId, secondaryId }` → move all messages from secondary to primary → delete secondary
- UI: ConversationHeader → "..." menu → "Merge with another conversation" → search dialog

### 2.12 Sentiment Dashboard (Live)
**What:** Every conversation shows a live sentiment indicator (positive/neutral/negative) based on last few messages
**Files:**
- DB: `conversations.sentiment VARCHAR(10) DEFAULT NULL` — updated by webhook
- Webhook: After each message, run lightweight sentiment check → update conversation.sentiment
- UI: ConversationList items → color-coded dot (green/gray/red)
- Analytics: Sentiment trend chart over time

---

## PHASE 3 — Enterprise & Scale

### 3.1 Stripe Billing
**What:** SaaS monetization — plan selection, subscription, usage limits
**Plans:**
- Free: 1 agent, 500 messages/month, basic features
- Pro (₹2999/mo): 5 agents, unlimited messages, all features
- Enterprise (custom): Unlimited agents, white label, priority support
**Files:**
- DB: `workspaces.stripe_customer_id`, `workspaces.plan VARCHAR(20) DEFAULT 'free'`, `workspaces.plan_expires_at`
- API: `/api/billing/` — create subscription, webhook for payment events
- UI: Settings → Billing — plan selection, usage meter, upgrade button

### 3.2 Multi-tenant White Label
**What:** Agency resellers — each client gets their own branded dashboard
**Files:**
- DB: `workspaces.custom_domain`, `workspaces.logo_url`, `workspaces.brand_color`
- Middleware: Detect custom domain → load workspace branding
- UI: Settings → Workspace → Branding (upload logo, set color)

### 3.3 Instagram DM + Facebook Messenger
**What:** Same inbox handles Instagram DMs and FB Messenger
**Files:**
- Webhook: Detect `entry[].changes[].field === 'instagram'` vs `'whatsapp'`
- DB: `conversations.channel VARCHAR(20) DEFAULT 'whatsapp'` (already exists)
- UI: Channel icon on conversation items (WhatsApp/Instagram/Messenger badge)

### 3.4 Semantic Search (pgvector)
**What:** Knowledge Base search using vector embeddings — much better AI answers
**Files:**
- DB: Enable pgvector extension, add `embedding vector(1536)` to knowledge_base
- API: On KB create → generate OpenAI embedding → store
- On query → embed query → cosine similarity search → return top-K
- Replace keyword scorer with vector search

### 3.5 Web Chat Widget
**What:** Embed a chat widget on any website that routes to WhatsApp
**Files:**
- `app/(widget)/widget/[workspaceId]/page.tsx` — embeddable iframe
- Script snippet for users to add to their website
- Widget opens WhatsApp deep link or web.whatsapp.com

### 3.6 Dual LLM Routing
**What:** Use different models for different tasks
- Fast/cheap: Groq Llama for auto-replies
- Smart: GPT-4o for escalation analysis
- Vision: GPT-4o-mini for images
**Files:**
- Settings: Select model per task type
- `lib/ai-router.ts` — route to correct provider

### 3.7 Async Campaign Queue
**What:** Large campaigns (10k+ contacts) run via BullMQ+Redis, not synchronously
**Files:**
- Install: `bullmq` + Upstash Redis (already configured)
- Worker: `lib/campaign-worker.ts`
- Campaign run API → enqueue job → return immediately
- Worker processes in background, updates progress in DB
- UI: Campaign shows real-time progress bar while running

---

## API Patterns (Critical — must follow)
- GET routes: `request.nextUrl.searchParams.get('workspaceId')`
- POST/PATCH routes: from `request.json()` body
- Auth: `requireWorkspacePermission(workspaceId, permission)`
- Admin client for webhook ops: `createAdminClient()`

## Key Env Vars
```
WHATSAPP_WABA_ID=1665259677955542
WHATSAPP_PHONE_NUMBER_ID=1109891212213897
WHATSAPP_WEBHOOK_SECRET=agentix-webhook-secret-2026
OPENROUTER_API_KEY=sk-or-v1-...
AI_MODEL=openai/gpt-oss-120b:free
UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
Cron secret (hardcoded fallback): agentix2026cron
```

## Cron Jobs (External via cron-job.org)
- Hourly: `GET /api/cron/check-sla-breaches?secret=agentix2026cron`
- Daily: `GET /api/cron/run-scheduled-campaigns?secret=agentix2026cron`
- Every 5 min: `GET /api/cron/process-follow-up-sequences?secret=agentix2026cron`
