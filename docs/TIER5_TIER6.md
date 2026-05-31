# Tier 5 — Integrations & Channels

> **Priority:** MEDIUM — Ecosystem expansion
> **Status:** NOT STARTED

---

## 1. Outbound Webhooks (Zapier / n8n compatible)

### What
Koi bhi Agentix event pe external system ko notify karo.

### Events to Support
- `message.received` — new inbound message
- `conversation.created` — new conversation
- `conversation.resolved` — conversation closed
- `contact.created` — new contact added
- `campaign.completed` — campaign finished

### DB
```sql
CREATE TABLE webhook_endpoints (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  url          TEXT NOT NULL,
  secret       VARCHAR(255), -- HMAC signing secret
  events       TEXT[] DEFAULT '{}', -- subscribed events
  is_active    BOOLEAN DEFAULT true
);
```

### Files
- `app/api/webhooks/outbound/route.ts` — register/manage endpoints
- `lib/outbound-webhook.ts` — dispatch function called from various routes

---

## 2. Shopify Integration

### What
- Order confirmed → WhatsApp confirmation auto-send
- Abandoned cart → WhatsApp reminder
- Shipping update → WhatsApp notification

### Setup
Shopify webhook → Agentix endpoint → Match contact by phone → Send template

### Files
- `app/api/integrations/shopify/route.ts` — Shopify webhook receiver
- Settings → Integrations → Shopify setup page

---

## 3. Google Sheets Sync

### What
- Export contacts to Google Sheet
- Import contacts from Google Sheet
- Real-time sync option

### Auth
Google OAuth2 for Sheets API access.

### Files
- `app/api/integrations/google-sheets/route.ts`
- `modules/contacts/components/` — "Sync to Sheets" button

---

## 4. Instagram DM + Facebook Messenger

### What
Same dashboard se Instagram DMs aur Facebook Messenger messages handle karo.

### How
Meta's Instagram Messaging API + Messenger Platform API.
Same webhook endpoint, different `entry[].changes[].field` value.

### Changes
- Webhook handler: detect `instagram` vs `whatsapp` vs `messenger`
- Conversations: `channel` field already exists (currently 'whatsapp')
- UI: channel icon badge on conversation items

---

## 5. Public REST API + SDK

### What
Developers ke liye public API — baaki apps connect kar sakein.

### Endpoints
```
GET  /api/v1/contacts
POST /api/v1/contacts
POST /api/v1/messages/send
GET  /api/v1/conversations
POST /api/v1/templates/send
```

### Auth
API Key per workspace (stored in `workspaces.api_key` column).

### Files
- `app/api/v1/` — versioned API routes
- `middleware.ts` — API key validation for `/api/v1/` routes

---

---

# Tier 6 — Enterprise Features

> **Priority:** LOW-MEDIUM — For scaling to B2B clients
> **Status:** NOT STARTED

---

## 1. Multi-workspace White Label

### What
Resell karo — har client ka apna workspace, custom domain, logo.

### Current State
Multi-workspace already supported in DB. Need:
- Custom domain per workspace (Vercel subdomain routing)
- Logo/branding customization
- Client billing (Stripe subscriptions)

### DB
```sql
ALTER TABLE workspaces ADD COLUMN custom_domain VARCHAR(255);
ALTER TABLE workspaces ADD COLUMN stripe_customer_id VARCHAR(255);
ALTER TABLE workspaces ADD COLUMN plan_expires_at TIMESTAMPTZ;
```

---

## 2. SLA Management

### What
First response time aur resolution time ke SLA set karo.

### DB
```sql
CREATE TABLE sla_policies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID REFERENCES workspaces(id),
  name                  VARCHAR(255),
  first_response_hours  INTEGER DEFAULT 1,
  resolution_hours      INTEGER DEFAULT 24,
  escalation_agent_id   UUID REFERENCES profiles(id)
);
```

### Logic
- Conversation created → start SLA timer
- Agent responds → first response SLA met
- Cron job checks breached SLAs → send notifications

---

## 3. Audit Logs

### What
Kaun kya kiya, kab kiya — full activity trail.

### Current State
`activities` table exists. Need:
- Better UI to view logs
- Filter by user, action type, date
- Export audit logs as CSV

### Files
- `modules/settings/components/AuditLog/` — NEW view
- `app/api/audit-logs/route.ts` — filtered query

---

## 4. Granular Role Permissions

### Current Roles
`super_admin`, `admin`, `manager`, `agent`

### Add
Custom roles with per-permission toggles:
- View only conversations
- Send messages but not delete
- View analytics but not export
- etc.

### DB
```sql
CREATE TABLE custom_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  name         VARCHAR(255),
  permissions  TEXT[] DEFAULT '{}'
);
```

---

## 5. Rate Limiting + Spam Protection

### What
- Same number se zyada messages → throttle/block
- Bot reply rate limiting (max 1 reply per 30 seconds per contact)
- Campaign send rate (WhatsApp allows 1000/day on basic, more on higher tier)

### Implementation
- Upstash Redis (already configured) for rate limiting
- `lib/rate-limit.ts` — sliding window counter

### Current Issue
Upstash Redis is configured but not fully used. Integrate with:
- Auto-reply: check last reply time before sending
- Campaign: spread sends over time if large audience
