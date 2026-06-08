# Agentix — Product Roadmap (Beat Getgabs)
> Save this file. Refer to it at the start of every new conversation.
> Last updated: June 2026

---

## GOAL
Beat Getgabs on every dimension:
- More WhatsApp-native features
- Better AI (already ahead, go further)
- Superior UI/UX
- Cheaper or equal pricing
- Faster, more reliable platform

---

## PHASE 1 — WhatsApp Native Features (Most Critical)
> These are the biggest gaps. Getgabs charges premium for these.

### 1.1 Interactive Messages (Buttons + Lists)
- Send messages with Quick Reply buttons
- Send List Messages (menu-style options)
- Send CTA buttons (call, URL)
- DB: add `interactive_type`, `interactive_payload` to messages table
- UI: message composer gets button/list builder

### 1.2 WhatsApp Forms
- Multi-step interactive data collection inside WhatsApp
- Use WA Flow API (Meta's native flow builder)
- Use cases: lead capture, appointment booking, order form, feedback
- DB: `wa_forms` table (steps JSON, responses JSON)
- UI: form builder in Settings + trigger from Flow nodes

### 1.3 WhatsApp Catalog
- Upload product catalog to Meta
- Send catalog/product cards in conversations
- Browse products directly in WhatsApp chat
- DB: `products` table (name, price, image, description, catalog_id)
- API: sync with Meta Catalog API
- UI: Products section under Settings + send product card from composer

### 1.4 WhatsApp Payments (India - UPI)
- Request payment inside WhatsApp chat
- Integration with Razorpay payment links (send as message)
- Track payment status via webhook
- DB: `payment_requests` table
- UI: "Request Payment" button in chat composer

### 1.5 OTP / Authentication Sending
- Send OTP via WhatsApp using authentication templates
- API endpoint: POST /api/v1/otp/send
- Track delivery + expiry
- UI: OTP Templates section

---

## PHASE 2 — Advanced Automation
> Make automation engine smarter than Getgabs

### 2.1 Conditional Logic in Sequences
- Add IF/ELSE conditions to drip sequences
- Conditions: tag present, lifecycle stage, lead score, last reply
- DB: update `follow_up_sequences.steps` schema to support conditions

### 2.2 Trigger-based Automations (Event Triggers)
- Abandoned cart trigger (via webhook from Shopify/WooCommerce)
- Birthday / Anniversary trigger (from contact date fields)
- Re-engagement trigger (no reply in X days)
- Back-in-stock trigger (webhook-based)
- Payment received trigger
- DB: `automation_triggers` table
- UI: Automation section (separate from Flows)

### 2.3 Smart Inbox (AI-powered)
- AI auto-categorizes conversations: Sales / Support / Spam
- AI suggests best reply from KB
- Priority inbox (VIP + hot leads at top)
- Unseen message count per category

---

## PHASE 3 — Integrations
> Getgabs has 50+. We need at least 10 deep integrations.

### 3.1 Shopify Integration
- Connect Shopify store → sync orders, products, customers
- Auto-trigger: order confirmed, shipped, delivered, abandoned cart
- Send order updates via WhatsApp automatically
- Sync Shopify customers as Agentix contacts

### 3.2 WooCommerce Integration
- WordPress plugin OR webhook-based
- Same triggers as Shopify

### 3.3 Google Sheets Integration
- Two-way sync: contacts ↔ Google Sheet
- Useful for teams who manage data in sheets

### 3.4 Zapier / Make (Integromat) Native App
- Publish Agentix as a Zapier app
- Triggers: new message, new contact, campaign completed
- Actions: send message, add contact, add tag

### 3.5 HubSpot / Zoho CRM Sync
- Push contacts + conversation notes to HubSpot/Zoho
- Pull deals and pipeline stage back

---

## PHASE 4 — Multi-Channel Expansion
> Getgabs has Instagram. We should go further.

### 4.1 Instagram DM Inbox
- Connect Instagram Business account
- Receive + reply to Instagram DMs from same inbox
- Unified inbox: WhatsApp + Instagram in one view

### 4.2 Chat Widget (Website Embed)
- Floating WhatsApp button on any website
- Customizable: color, message, position
- One-line embed code
- Track leads from widget separately
- DB: `chat_widgets` table (workspace_id, config, embed_key)

### 4.3 Click-to-WhatsApp Ads (CTWA) Tracking
- Detect when conversation came from a Meta ad
- Tag contact with ad source automatically
- Report: which ads → how many conversations → how many converted

### 4.4 Google Sign-In
- Add "Sign in with Google" to login/signup pages

---

## PHASE 5 — UI/UX Overhaul (Beat Getgabs Visually)
> This is how we win the trial user. First impression = revenue.

### 5.1 New Dashboard / Home Page
- Real-time KPI cards: messages today, open conversations, campaign ROI
- Quick actions bar (send broadcast, create contact, etc.)
- Recent activity feed

### 5.2 Conversation UI Upgrade
- WhatsApp-like bubble design (green/white)
- Typing indicators
- Message reactions
- Voice note playback
- Better media preview (image lightbox, video player)
- Contact profile sidebar with full CRM data visible

### 5.3 Mobile-Responsive Design
- Full mobile support for inbox (agents can reply from phone)
- PWA (installable as app)

### 5.4 Onboarding Flow
- Step-by-step setup wizard for new workspaces
- Connect WhatsApp → Import contacts → Create first campaign
- Progress bar, tooltips, sample data

### 5.5 Design System Upgrade
- Fresher color palette
- Better typography (Inter / Geist)
- Micro-animations (smooth transitions)
- Dark mode support
- Empty states with illustrations (not blank pages)

---

## PHASE 6 — Unique Differentiators (Things Getgabs Doesn't Have)
> This is what makes us #1

### 6.1 AI Revenue Intelligence
- "This contact is likely to buy" prediction
- Best time to send message prediction (per contact timezone/activity)
- Auto-identify hot leads from conversations

### 6.2 WhatsApp Commerce Analytics
- Revenue tracked per campaign
- Which template → which conversion
- Customer lifetime value from WhatsApp

### 6.3 Team Performance Dashboard
- Agent response time leaderboard
- CSAT scores per agent
- Messages handled per agent per day

### 6.4 Broadcast Approval Workflow
- Campaigns need manager approval before sending
- Useful for enterprise teams to prevent mistakes

### 6.5 Multi-language AI
- AI auto-detects customer language
- Replies in Hindi, English, Hinglish automatically

### 6.6 White-Label Option
- Allow agencies to rebrand Agentix as their own product
- Custom domain, logo, color scheme per workspace

---

## EXECUTION ORDER (Start Here)

| Priority | Phase | Feature | Effort | Impact |
|----------|-------|---------|--------|--------|
| 1 | P1 | Interactive Buttons & Lists | Medium | Very High |
| 2 | P5 | UI/UX - Conversation upgrade | Medium | Very High |
| 3 | P1 | WhatsApp Catalog | High | Very High |
| 4 | P2 | Trigger automations (birthday, cart) | Medium | High |
| 5 | P4 | Chat Widget | Low | High |
| 6 | P1 | WhatsApp Forms | High | High |
| 7 | P3 | Shopify Integration | High | Very High |
| 8 | P5 | Onboarding Flow | Medium | High |
| 9 | P4 | Instagram Inbox | High | Medium |
| 10 | P6 | AI Revenue Intelligence | Medium | High |

---

## HOW TO USE THIS ROADMAP IN NEW CONVERSATIONS

Start every new chat with:
> "Read ROADMAP.md and then let's implement [feature name]"

Each feature = one conversation ideally.
