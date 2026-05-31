# Agentix — Project State & Architecture

## What Is This
WhatsApp Business automation SaaS platform. Next.js 16 App Router + Supabase + Meta WhatsApp Cloud API + OpenRouter AI (GPT).

## Live URLs
- **Production:** https://whatsapp-automation-kohl-six.vercel.app
- **GitHub:** https://github.com/Kunalmishra77/WhatsApp-Automation
- **Supabase:** https://yvqaproltcskufufmomi.supabase.co

## Tech Stack
| Layer | Tech |
|---|---|
| Frontend | Next.js 16 App Router, TypeScript, Tailwind, shadcn/ui |
| Backend | Next.js API Routes (serverless) |
| Database | Supabase (PostgreSQL + Realtime + Auth) |
| AI | OpenRouter API — `openai/gpt-oss-120b:free` |
| Deployment | Vercel (auto-deploy from main branch) |
| WhatsApp | Meta Cloud API v19.0 |

## Env Variables (all set on Vercel)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
WHATSAPP_PHONE_NUMBER_ID=1109891212213897
WHATSAPP_WABA_ID=1665259677955542
WHATSAPP_ACCESS_TOKEN=EAAVylc... (temporary — needs permanent token)
WHATSAPP_WEBHOOK_SECRET=agentix-webhook-secret-2026
META_APP_SECRET=3bc37642b8559a97a0a099d6ae07af6e
OPENROUTER_API_KEY=sk-or-v1-...
AI_MODEL=openai/gpt-oss-120b:free
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

## Database Schema (Supabase)
Tables: `profiles`, `workspaces`, `workspace_members`, `contacts`, `conversations`, `messages`, `templates`, `campaigns`, `leads`, `whatsapp_webhook_events`, `notifications`, `activities`

Key columns in `workspaces`: `waba_id`, `phone_number_id`, `access_token`, `webhook_secret`

## What's Been Built (Completed Features)

### Core Infrastructure
- [x] Auth (Supabase Auth — login, signup, forgot password, email verify)
- [x] Workspace setup + multi-workspace support
- [x] RLS policies + role-based permissions (super_admin, admin, manager, agent)
- [x] Supabase Realtime subscriptions for live updates
- [x] Admin client (service role) for webhook operations

### WhatsApp Integration
- [x] Webhook handler — `POST /api/webhooks/whatsapp` (signature verified)
- [x] Inbound message processing (text, image, video, audio, document, location)
- [x] Message status updates (sent → delivered → read)
- [x] Auto-reply with OpenRouter AI (GPT) — context-aware per user message
- [x] Bot reply saved to DB (shows in dashboard)
- [x] Contact name preserved correctly (not overwritten by phone number)

### Conversations Dashboard
- [x] Conversation list (realtime, search, status tabs)
- [x] Chat window with message bubbles
- [x] Agent can send messages (saved to DB + sent via WhatsApp)
- [x] Internal notes
- [x] Customer panel (contact info)
- [x] Typing indicator (broadcast)
- [x] Optimistic UI for sent messages

### Templates
- [x] Template CRUD (create, edit, delete)
- [x] Submit to Meta API (`POST /api/templates/[id]/submit`)
  - Includes `example.body_text` for variables (prevents INVALID_FORMAT rejection)
- [x] Sync from Meta (`POST /api/templates/sync`) — imports all Meta templates
- [x] Live preview in template form
- [x] Status display (pending/approved/rejected/paused)

### Campaigns (Bulk Messaging)
- [x] Campaign wizard (5-step: name → template → audience → schedule → review)
- [x] Campaign execution engine (`POST /api/campaigns/[id]/run`)
  - Fetches contacts by audience_type (all / tag filter)
  - Sends WhatsApp template messages with variable substitution
  - 200ms rate-limit delay between sends
  - Updates sent_count, failed_count, status
  - Saves outbound message records per conversation
- [x] "Send Now" button on draft/scheduled campaigns

### Contacts
- [x] Contact list with search, pagination
- [x] Contact CRUD + CSV import
- [x] **Start Conversation** — send first template message to any contact
  - Template picker with live preview + variable substitution
  - Creates conversation in DB + redirects to chat

### Other Modules
- [x] CRM Pipeline (Kanban leads)
- [x] Analytics page (basic)
- [x] Team management
- [x] Settings page

## Known Issues / Pending
- [ ] `WHATSAPP_ACCESS_TOKEN` is temporary — expires. Need permanent System User token
- [ ] `hello_world` template is Meta sample — only works from test numbers, not production
- [ ] `first_message` (marketing template) — still PENDING Meta approval
- [ ] `order_update` (utility template) — PENDING Meta approval (submitted with examples fix)
- [ ] Business Verification not done — may cause template rejection issues
- [ ] WhatsApp Manager (business.facebook.com) — not directly accessible, use developers.facebook.com
- [ ] No auto-sync of template status from Meta (manual "Sync from Meta" needed)
- [ ] Campaign scheduler — no cron job yet (manual "Send Now" only)

## API Routes
```
GET  /api/webhooks/whatsapp          — Meta webhook verification
POST /api/webhooks/whatsapp          — Inbound messages + status updates
POST /api/messages/send              — Agent sends message from dashboard
POST /api/templates/[id]/submit      — Submit template to Meta for approval
POST /api/templates/sync             — Sync all Meta templates to DB
POST /api/campaigns/[id]/run         — Execute campaign (send to all contacts)
POST /api/contacts/[id]/start-conversation — Send first template to new contact
POST /api/auth/callback              — Supabase auth callback
POST /api/data-deletion              — Meta data deletion webhook
```

## Modules Structure
```
modules/
  auth/          — login, signup, forgot-password components + services
  conversations/ — chat UI, message hooks, conversation list
  contacts/      — table, form, import wizard, start-conversation dialog
  templates/     — form, list, preview, hooks
  campaigns/     — wizard, list, hooks
  crm/           — pipeline kanban
  analytics/     — charts
  team/          — member management
  settings/      — workspace settings
  notifications/ — notification center
```
