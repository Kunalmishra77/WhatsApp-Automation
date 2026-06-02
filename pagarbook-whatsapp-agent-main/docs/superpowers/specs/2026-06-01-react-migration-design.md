# WhatsApp CRM Platform — React Migration & WA-CRM Feature Parity Design

**Date:** 2026-06-01  
**Status:** Approved for implementation

---

## 1. Goal

Restructure the existing HTML/vanilla frontend into a production-grade React SPA while keeping the Express backend intact, and close all feature gaps vs. the WA-CRM (ArnasDon/wacrm) reference project.

---

## 2. What Exists Today

### Backend (keep as-is, extend)
- `server.js` — Express API, 2,414 lines, fully functional
- APIs: clients, campaigns, templates, contacts, tags, sessions/chats, agents, pipelines/deals, automations, flows, analytics, media
- Multi-tenant PostgreSQL: central DB + per-client tenant DBs
- BullMQ campaign queue, pgvector RAG, OpenAI LLM

### Frontend (replace entirely)
- `public/index.html` — 260KB single file, 12 nav tabs
- Vanilla JS, no build tooling, no routing, no state management

---

## 3. Feature Gap Analysis (vs. WA-CRM)

| Feature | Current | WA-CRM | Action |
|---|---|---|---|
| Auth / Login | None | JWT workspace auth | Add |
| Dashboard | Basic stats | Enhanced analytics | Improve |
| Inbox / Chats | Table view | Real-time 3-pane inbox | Redesign |
| Contacts + Tags | Done | Done | Port |
| Campaigns | Done | Done | Port |
| Templates | Done | Done | Port |
| Flows (visual builder) | Drawflow (basic) | ReactFlow (rich) | Upgrade |
| Automations | Done | Done | Port |
| **Inbox Rules** | Missing | Full CRUD | Add |
| **Sequences** | Missing | follow_up_sequences | Add |
| **Leads (Kanban)** | Deals/pipelines only | Full leads board | Add |
| Conversation resolve/assign | Partial | Full status management | Complete |
| Real-time updates | None (manual refresh) | SSE / polling | Add SSE |
| Media Library | Done | Done | Port |
| Settings (AI Agent) | Done | Done | Port |
| Reporting | Basic | Enhanced charts | Improve |

---

## 4. Architecture

### Frontend Stack
- **React 18** + **Vite** (fast builds, HMR)
- **React Router v6** (SPA routing, nested layouts)
- **TanStack Query v5** (data fetching, caching, invalidation)
- **Tailwind CSS** + **shadcn/ui** (component library matching existing design tokens)
- **Zustand** (auth state, selected client)
- **ReactFlow** (visual flow builder)
- **Recharts** (analytics charts)
- **React Hot Toast** (notifications)

### Directory Structure
```
frontend/
├── package.json
├── vite.config.js          # proxy /api → localhost:3000
├── tailwind.config.js
├── index.html
└── src/
    ├── main.jsx
    ├── App.jsx              # Router + QueryClient + Toaster
    ├── store/
    │   └── auth.js          # Zustand: token, clientId, user
    ├── api/
    │   └── client.js        # axios instance with auth header
    ├── hooks/               # per-feature TanStack Query hooks
    ├── components/
    │   ├── layout/          # Sidebar, Topbar, Layout
    │   └── ui/              # shared Button, Badge, Table, Modal
    └── pages/
        ├── Login.jsx
        ├── Dashboard.jsx
        ├── Chats.jsx        # 3-pane: list | messages | details
        ├── Contacts.jsx
        ├── Campaigns.jsx
        ├── Templates.jsx
        ├── Flows.jsx        # ReactFlow builder
        ├── Automations.jsx
        ├── InboxRules.jsx   # NEW
        ├── Sequences.jsx    # NEW
        ├── Leads.jsx        # NEW - Kanban board
        ├── Analytics.jsx
        └── Settings.jsx     # clients, agents, docs, media, AI config
```

### Build Output
Vite builds to `public/` — served by existing `express.static`.

---

## 5. New Backend Features

### 5a. Authentication
- `POST /api/auth/login` — email + password → JWT
- `GET /api/auth/me` — returns logged-in agent info
- `POST /api/auth/logout`
- JWT middleware protecting all existing `/api/*` routes
- Agents table already exists; add `password_hash` bcrypt support

### 5b. Inbox Rules
New table: `public.inbox_rules`
```sql
CREATE TABLE public.inbox_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_value JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
API: `GET/POST /api/inbox-rules`, `PUT/DELETE /api/inbox-rules/:id`

### 5c. Follow-up Sequences
New table: `public.follow_up_sequences`
```sql
CREATE TABLE public.follow_up_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  steps JSONB NOT NULL DEFAULT '[]',  -- [{delay_hours, message}]
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.follow_up_sequences(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 0,
  next_send_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
API: `GET/POST /api/sequences`, `PUT/DELETE /api/sequences/:id`, `POST /api/sequences/:id/enroll`

### 5d. Leads
New table: `public.leads`
```sql
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contact_phone TEXT,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new',
  value NUMERIC(12,2),
  priority TEXT DEFAULT 'medium',
  notes TEXT,
  follow_up_at TIMESTAMPTZ,
  assigned_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
API: `GET/POST /api/leads`, `PATCH/DELETE /api/leads/:id`

### 5e. Server-Sent Events (real-time)
`GET /api/sse?client_id=X` — streams new message events to the inbox page.
Broadcast from inbound webhook handler.

### 5f. Conversation Status
Add to existing sessions endpoints:
- `POST /api/sessions/:id/resolve` — marks resolved
- `POST /api/sessions/:id/reopen`

---

## 6. Pages Detail

### Login
- Email + password form
- On success: store JWT in Zustand + localStorage, redirect to dashboard

### Dashboard
- Stats cards (total conversations, active, campaigns, delivery rate)
- Message trend chart (Recharts LineChart)
- Quick filters for leads by category

### Chats (3-pane inbox)
- Left pane: conversation list with SSE-updated unread badges, filter tabs (all/active/paused/resolved)
- Center pane: message thread with send bar (text/media/template), pause/resume/resolve controls
- Right pane: contact info, tags, deals, notes, agent assignment

### Contacts
- Searchable/filterable table
- CSV import (existing SheetJS logic ported)
- Tag management inline

### Campaigns
- List with delivery stats
- Create campaign wizard: pick template → import/select recipients → confirm

### Templates
- List from Meta API
- Create template form with component builder
- Preview panel

### Flows (ReactFlow)
- List page with create/delete/toggle
- Editor: drag-drop nodes (message, condition, wait, assign, end)
- Save/publish flow

### Automations
- List with toggle
- Create/edit with step builder

### Inbox Rules (new)
- Table of rules (name, trigger type, actions, priority, active toggle)
- Create/edit modal

### Sequences (new)
- List of follow-up sequences
- Create/edit: name + steps array (delay_hours + message text)
- Enroll contact(s) in a sequence

### Leads (new)
- Kanban board: columns = stages (new, contacted, qualified, proposal, won, lost)
- Drag-drop cards between stages
- Card: contact phone, title, value, assigned agent, follow-up date

### Analytics
- Message volume trend (7/30d), campaign delivery funnel, lead conversion by stage
- Recharts BarChart + LineChart + PieChart

### Settings
- Tabs: Clients, AI Agent config, Team/Agents, Documents/KB, Media Library

---

## 7. Migration Strategy

1. Create `frontend/` with Vite scaffold (no changes to backend yet)
2. Vite dev proxy: `/api → http://localhost:3000`
3. Build all pages without auth first (use hardcoded client_id from localStorage)
4. Add auth endpoints to backend
5. Wrap routes in `<ProtectedRoute>`
6. Add new backend endpoints (inbox rules, sequences, leads, SSE)
7. Add DB migrations
8. Build new pages (InboxRules, Sequences, Leads)
9. `npm run build` → outputs to `public/`
10. Remove old `public/index.html` after validation

---

## 8. Non-Goals

- No Next.js (overkill — existing Express backend is the server)
- No TypeScript (keep JS for speed)
- No mobile app
- No Supabase (keep existing PostgreSQL)
