# 🚀 Agentix WhatsApp CRM & Messaging Suite
## Master Engineering & Product Blueprint — v2.0

> **Classification:** Internal Engineering Specification  
> **Status:** Production Blueprint  
> **Version:** 2.0.0  
> **Last Updated:** 2025  
> **Audience:** Engineering Leads, Product Managers, DevOps, Design Systems

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Strategy](#2-product-vision--strategy)
3. [Tech Stack — Rationale & Decisions](#3-tech-stack--rationale--decisions)
4. [System Architecture](#4-system-architecture)
5. [Folder Structure](#5-folder-structure)
6. [Database Schema](#6-database-schema)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Core Modules — Detailed Specs](#8-core-modules--detailed-specs)
9. [Real-time Architecture](#9-real-time-architecture)
10. [AI Agent Architecture](#10-ai-agent-architecture)
11. [API Design Standards](#11-api-design-standards)
12. [Design System & UI/UX Principles](#12-design-system--uiux-principles)
13. [State Management Architecture](#13-state-management-architecture)
14. [Security Architecture](#14-security-architecture)
15. [Performance Engineering](#15-performance-engineering)
16. [DevOps & Infrastructure](#16-devops--infrastructure)
17. [Testing Strategy](#17-testing-strategy)
18. [Multi-Tenancy Architecture](#18-multi-tenancy-architecture)
19. [WhatsApp Business API Integration](#19-whatsapp-business-api-integration)
20. [Analytics & Observability](#20-analytics--observability)
21. [Environment Configuration](#21-environment-configuration)
22. [Deployment Runbook](#22-deployment-runbook)
23. [Roadmap & Versioning](#23-roadmap--versioning)
24. [Engineering Standards & Code Quality](#24-engineering-standards--code-quality)

---

## 1. Executive Summary

**Agentix** is an enterprise-grade, multi-tenant WhatsApp CRM & Messaging Suite that enables businesses to manage customer conversations at scale. It unifies real-time messaging, AI-powered automation, CRM pipeline management, bulk campaign execution, and team collaboration into a single, cohesive platform.

### Business Goals

| Goal | Metric |
|------|--------|
| Enterprise market positioning | Compete with Intercom, Zendesk, HubSpot |
| Time to value | < 15 min from signup to first message |
| Scale target | 10,000+ concurrent conversations per tenant |
| AI automation rate | 60%+ of tier-1 queries auto-resolved |
| Uptime SLA | 99.95% |

### Core Differentiators

- **AI-First Architecture** — Every conversation module is AI-ready by default
- **True Real-Time** — Sub-100ms message delivery via Supabase Realtime + WebSocket
- **Multi-Agent System** — Route, escalate, and automate using a visual agent builder
- **Enterprise CRM** — Full pipeline management natively embedded with conversations
- **Zero-Config Multi-Tenancy** — Workspace isolation from day one

---

## 2. Product Vision & Strategy

### The Product Trinity

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│    COMMUNICATE         MANAGE            AUTOMATE       │
│    ───────────         ──────            ────────       │
│    WhatsApp Chat       CRM Pipeline      AI Agents      │
│    Broadcast           Contact DB        Smart Routing  │
│    Templates           Analytics         Workflows      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### User Personas

**Super Admin** — Platform owner. Full control. Billing, workspace config, global settings.  
**Admin** — Organization manager. Team management, WhatsApp WABA setup, advanced analytics.  
**Manager** — Team lead. Campaign creation, agent oversight, CRM pipeline management.  
**Agent** — Frontline operator. Real-time conversations, lead management, contact updates.

### Competitive Positioning Matrix

| Feature | Agentix | Intercom | Zendesk | HubSpot |
|---------|---------|---------|---------|---------|
| WhatsApp Native | ✅ | ⚠️ | ⚠️ | ❌ |
| AI-Powered Routing | ✅ | ✅ | ⚠️ | ⚠️ |
| Bulk Campaigns | ✅ | ❌ | ❌ | ✅ |
| CRM Embedded | ✅ | ⚠️ | ⚠️ | ✅ |
| Real-time Collab | ✅ | ✅ | ✅ | ❌ |
| Multi-Agent AI | ✅ | ❌ | ❌ | ❌ |
| Open Source Core | ✅ | ❌ | ❌ | ❌ |

---

## 3. Tech Stack — Rationale & Decisions

### Frontend Stack

| Technology | Version | Rationale |
|-----------|---------|-----------|
| **Next.js** | 15 (App Router) | RSC for performance, streaming SSR, Vercel-native |
| **TypeScript** | 5.x | End-to-end type safety, DX at scale |
| **Tailwind CSS** | 3.4+ | Utility-first, design system friendly, purge-safe |
| **shadcn/ui** | Latest | Accessible, composable, owned components |
| **Framer Motion** | 11+ | Production-grade animations, layout transitions |
| **Zustand** | 5.x | Lightweight global state, devtools support |
| **TanStack Query** | v5 | Server state sync, cache invalidation, optimistic updates |
| **Socket.io Client** | 4.x | WebSocket fallback transport for realtime |
| **React Hook Form** | 7.x | Performant forms, minimal re-renders |
| **Zod** | 3.x | Schema validation, type inference |

### Backend & Data

| Technology | Purpose |
|-----------|---------|
| **Supabase** | BaaS: Auth, DB, Realtime, Storage, Edge Functions |
| **PostgreSQL 15** | Primary database via Supabase |
| **Supabase Realtime** | Live queries, broadcast, presence |
| **Supabase Storage** | Media files, document uploads |
| **Supabase Edge Functions** | Serverless compute (Deno runtime) |
| **Prisma ORM** | Type-safe DB access in Edge Functions and migrations |
| **Redis (Upstash)** | Session cache, rate limiting, job queues |
| **BullMQ** | Background job processing (campaign queues) |

### Infrastructure

| Layer | Technology |
|-------|-----------|
| **Hosting** | Vercel (Edge Network) |
| **Database** | Supabase (managed PostgreSQL) |
| **CDN** | Vercel Edge + Cloudflare |
| **Secrets** | Vercel Environment Variables |
| **Monitoring** | Sentry + Axiom + Supabase Dashboard |
| **CI/CD** | GitHub Actions + Vercel Preview Deployments |

---

## 4. System Architecture

### High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                  │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │         Next.js 15 App Router (Vercel Edge Network)          │    │
│  │   React Components │ Zustand │ TanStack Query │ Framer Motion│    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ HTTPS / WebSocket
┌──────────────────────────▼───────────────────────────────────────────┐
│                        API GATEWAY LAYER                              │
│  ┌────────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │  Next.js API Routes│  │  Edge Functions  │  │  Webhook Handler │  │
│  │  (App Router)      │  │  (Supabase Deno) │  │  (Meta/WhatsApp) │  │
│  └────────────────────┘  └─────────────────┘  └──────────────────┘  │
└────────────┬─────────────────────┬────────────────────┬──────────────┘
             │                     │                    │
┌────────────▼──────┐   ┌──────────▼───────┐  ┌───────▼──────────────┐
│   SUPABASE CORE   │   │   QUEUE LAYER     │  │   EXTERNAL SERVICES  │
│  ┌─────────────┐  │   │  ┌────────────┐  │  │  ┌────────────────┐  │
│  │  PostgreSQL  │  │   │  │  BullMQ /  │  │  │  │ Meta WhatsApp  │  │
│  │  Auth        │  │   │  │  Upstash   │  │  │  │ Business API   │  │
│  │  Realtime    │  │   │  └────────────┘  │  │  ├────────────────┤  │
│  │  Storage     │  │   │  ┌────────────┐  │  │  │ OpenAI / Gemini│  │
│  │  RLS         │  │   │  │  Redis     │  │  │  │ (AI Agents)    │  │
│  └─────────────┘  │   │  └────────────┘  │  │  └────────────────┘  │
└───────────────────┘   └──────────────────┘  └──────────────────────┘
```

### Request Lifecycle

```
User Action → Next.js Route Handler → Zod Validation → Auth Middleware
    → Supabase RLS Check → Query/Mutation → Realtime Broadcast
    → Client Optimistic Update → UI Re-render
```

### Multi-Tenant Data Flow

```
Request → Extract workspace_id (JWT claim) → Apply RLS Policy
    → Tenant-scoped data access → Response
```

---

## 5. Folder Structure

```
agentix/
├── app/                                    # Next.js App Router
│   ├── (auth)/                             # Auth route group
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── signup/
│   │   │   └── page.tsx
│   │   ├── forgot-password/
│   │   │   └── page.tsx
│   │   └── verify-email/
│   │       └── page.tsx
│   ├── (dashboard)/                        # Protected dashboard group
│   │   ├── layout.tsx                      # Shell layout with sidebar
│   │   ├── page.tsx                        # Dashboard home
│   │   ├── conversations/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── contacts/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── crm/
│   │   │   ├── page.tsx
│   │   │   └── [leadId]/
│   │   │       └── page.tsx
│   │   ├── campaigns/
│   │   │   ├── page.tsx
│   │   │   ├── new/
│   │   │   │   └── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── templates/
│   │   │   └── page.tsx
│   │   ├── team/
│   │   │   └── page.tsx
│   │   ├── analytics/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       ├── profile/
│   │       ├── workspace/
│   │       ├── whatsapp/
│   │       ├── notifications/
│   │       └── billing/
│   ├── api/                                # API Route Handlers
│   │   ├── webhooks/
│   │   │   └── whatsapp/
│   │   │       └── route.ts
│   │   ├── campaigns/
│   │   │   └── route.ts
│   │   ├── contacts/
│   │   │   └── route.ts
│   │   └── ai/
│   │       └── route.ts
│   ├── layout.tsx                          # Root layout
│   ├── globals.css
│   └── providers.tsx                       # Global providers wrapper
│
├── components/                             # Reusable UI components
│   ├── ui/                                 # shadcn base components
│   ├── common/                             # Shared cross-module components
│   │   ├── Avatar/
│   │   ├── Badge/
│   │   ├── DataTable/
│   │   ├── EmptyState/
│   │   ├── ErrorBoundary/
│   │   ├── LoadingSpinner/
│   │   ├── PageHeader/
│   │   ├── SearchInput/
│   │   └── SkeletonLoader/
│   ├── layout/                             # Layout components
│   │   ├── AppShell/
│   │   ├── Sidebar/
│   │   ├── TopBar/
│   │   ├── MobileNav/
│   │   └── CommandPalette/
│   └── charts/                             # Chart components
│       ├── AreaChart/
│       ├── BarChart/
│       ├── DonutChart/
│       └── MetricCard/
│
├── modules/                                # Feature modules (vertical slices)
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types/
│   ├── conversations/
│   │   ├── components/
│   │   │   ├── ConversationList/
│   │   │   ├── ChatWindow/
│   │   │   ├── MessageBubble/
│   │   │   ├── TypingIndicator/
│   │   │   ├── MessageInput/
│   │   │   ├── ConversationHeader/
│   │   │   └── CustomerPanel/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types/
│   ├── crm/
│   │   ├── components/
│   │   │   ├── KanbanBoard/
│   │   │   ├── LeadCard/
│   │   │   ├── LeadDetail/
│   │   │   └── PipelineStage/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types/
│   ├── campaigns/
│   │   ├── components/
│   │   │   ├── CampaignBuilder/
│   │   │   ├── CampaignList/
│   │   │   ├── AudienceSelector/
│   │   │   └── CampaignAnalytics/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types/
│   ├── contacts/
│   ├── templates/
│   ├── team/
│   ├── analytics/
│   ├── notifications/
│   └── settings/
│
├── services/                               # Singleton service layer
│   ├── supabase/
│   │   ├── client.ts                       # Browser client
│   │   ├── server.ts                       # Server client
│   │   └── middleware.ts
│   ├── whatsapp/
│   │   ├── api.ts                          # Meta Graph API wrapper
│   │   ├── webhook.ts                      # Webhook processor
│   │   └── templates.ts
│   ├── ai/
│   │   ├── agents.ts                       # AI agent orchestration
│   │   ├── classifier.ts                   # Intent classification
│   │   └── embeddings.ts
│   └── queue/
│       ├── campaign.queue.ts
│       └── notification.queue.ts
│
├── hooks/                                  # Global custom hooks
│   ├── useAuth.ts
│   ├── useWorkspace.ts
│   ├── useRealtime.ts
│   ├── useDebounce.ts
│   ├── useInfiniteScroll.ts
│   ├── useMediaUpload.ts
│   ├── useNotifications.ts
│   └── useCommandPalette.ts
│
├── store/                                  # Zustand global stores
│   ├── auth.store.ts
│   ├── workspace.store.ts
│   ├── conversation.store.ts
│   ├── notification.store.ts
│   └── ui.store.ts
│
├── lib/                                    # Utility libraries
│   ├── utils.ts
│   ├── cn.ts
│   ├── date.ts
│   ├── format.ts
│   ├── validators.ts
│   └── constants.ts
│
├── types/                                  # Global TypeScript types
│   ├── database.types.ts                   # Generated from Supabase
│   ├── api.types.ts
│   ├── auth.types.ts
│   ├── conversation.types.ts
│   ├── campaign.types.ts
│   └── crm.types.ts
│
├── animations/                             # Framer Motion variants
│   ├── page.animations.ts
│   ├── list.animations.ts
│   ├── modal.animations.ts
│   └── chat.animations.ts
│
├── realtime/                               # Supabase Realtime layer
│   ├── channels.ts                         # Channel definitions
│   ├── presence.ts                         # Presence tracking
│   ├── subscriptions.ts                    # Subscription management
│   └── handlers.ts                         # Event handlers
│
├── database/                               # Database layer
│   ├── migrations/                         # Prisma/SQL migrations
│   ├── seeds/                              # Development seeds
│   └── policies/                           # RLS policy files
│
├── supabase/                               # Supabase project
│   ├── functions/                          # Edge Functions
│   │   ├── process-campaign/
│   │   ├── whatsapp-webhook/
│   │   ├── ai-agent/
│   │   └── send-notification/
│   ├── migrations/
│   └── config.toml
│
├── middleware.ts                           # Next.js middleware (auth guard)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.local.example
└── package.json
```

---

## 6. Database Schema

### Schema Overview

```sql
-- ENUMS
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'manager', 'agent');
CREATE TYPE conversation_status AS ENUM ('open', 'assigned', 'resolved', 'pending', 'snoozed');
CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'audio', 'document', 'location', 'sticker', 'interactive', 'template', 'internal_note');
CREATE TYPE message_status AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE lead_stage AS ENUM ('new', 'contacted', 'follow_up', 'interested', 'converted', 'lost');
CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed');
CREATE TYPE template_status AS ENUM ('pending', 'approved', 'rejected', 'paused');
CREATE TYPE template_category AS ENUM ('authentication', 'marketing', 'utility');
```

### Core Tables

```sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- WORKSPACES (Multi-tenancy root)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE workspaces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,
  logo_url        TEXT,
  plan            VARCHAR(50) DEFAULT 'starter',
  waba_id         VARCHAR(255),            -- WhatsApp Business Account ID
  phone_number_id VARCHAR(255),            -- WhatsApp Phone Number ID
  access_token    TEXT,                    -- Encrypted WABA token
  webhook_secret  VARCHAR(255),
  settings        JSONB DEFAULT '{}',
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- USERS & WORKSPACE MEMBERS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       VARCHAR(255) NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  avatar_url      TEXT,
  phone           VARCHAR(50),
  timezone        VARCHAR(100) DEFAULT 'UTC',
  preferences     JSONB DEFAULT '{}',
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workspace_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            user_role NOT NULL DEFAULT 'agent',
  is_online       BOOLEAN DEFAULT false,
  max_chats       INTEGER DEFAULT 10,
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CONTACTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  phone           VARCHAR(50) NOT NULL,
  name            VARCHAR(255),
  email           VARCHAR(255),
  avatar_url      TEXT,
  company         VARCHAR(255),
  country         VARCHAR(100),
  language        VARCHAR(10) DEFAULT 'en',
  tags            TEXT[] DEFAULT '{}',
  custom_fields   JSONB DEFAULT '{}',
  is_blocked      BOOLEAN DEFAULT false,
  opted_out       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, phone)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CONVERSATIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE conversations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  assigned_agent_id   UUID REFERENCES profiles(id),
  status              conversation_status DEFAULT 'open',
  channel             VARCHAR(50) DEFAULT 'whatsapp',
  inbox_id            UUID,
  subject             TEXT,
  last_message        TEXT,
  last_message_at     TIMESTAMPTZ,
  unread_count        INTEGER DEFAULT 0,
  labels              TEXT[] DEFAULT '{}',
  is_pinned           BOOLEAN DEFAULT false,
  is_starred          BOOLEAN DEFAULT false,
  snoozed_until       TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  meta                JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MESSAGES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sender_type         VARCHAR(20) NOT NULL,    -- 'contact' | 'agent' | 'bot' | 'system'
  sender_id           UUID,
  direction           message_direction NOT NULL,
  type                message_type NOT NULL DEFAULT 'text',
  content             TEXT,
  media_url           TEXT,
  media_mime_type     VARCHAR(100),
  media_size          INTEGER,
  media_filename      TEXT,
  caption             TEXT,
  whatsapp_msg_id     VARCHAR(255),            -- Meta's message ID
  status              message_status DEFAULT 'queued',
  is_deleted          BOOLEAN DEFAULT false,
  reply_to_id         UUID REFERENCES messages(id),
  reactions           JSONB DEFAULT '{}',
  metadata            JSONB DEFAULT '{}',
  delivered_at        TIMESTAMPTZ,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CRM LEADS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES contacts(id),
  conversation_id     UUID REFERENCES conversations(id),
  assigned_agent_id   UUID REFERENCES profiles(id),
  title               VARCHAR(255) NOT NULL,
  stage               lead_stage DEFAULT 'new',
  value               DECIMAL(12,2),
  currency            VARCHAR(10) DEFAULT 'USD',
  priority            VARCHAR(20) DEFAULT 'medium',
  source              VARCHAR(100),
  notes               TEXT,
  tags                TEXT[] DEFAULT '{}',
  custom_fields       JSONB DEFAULT '{}',
  follow_up_at        TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TEMPLATES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  category            template_category NOT NULL,
  language            VARCHAR(10) DEFAULT 'en',
  status              template_status DEFAULT 'pending',
  header_type         VARCHAR(20),            -- 'text' | 'image' | 'video' | 'document'
  header_content      TEXT,
  body                TEXT NOT NULL,
  footer              TEXT,
  buttons             JSONB DEFAULT '[]',
  variables           TEXT[] DEFAULT '{}',
  meta_template_id    VARCHAR(255),
  rejection_reason    TEXT,
  created_by          UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CAMPAIGNS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  template_id         UUID REFERENCES templates(id),
  status              campaign_status DEFAULT 'draft',
  audience_type       VARCHAR(50),            -- 'all' | 'segment' | 'tags' | 'csv'
  audience_filter     JSONB DEFAULT '{}',
  total_recipients    INTEGER DEFAULT 0,
  sent_count          INTEGER DEFAULT 0,
  delivered_count     INTEGER DEFAULT 0,
  read_count          INTEGER DEFAULT 0,
  failed_count        INTEGER DEFAULT 0,
  scheduled_at        TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_by          UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- NOTIFICATIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type            VARCHAR(100) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  body            TEXT,
  data            JSONB DEFAULT '{}',
  is_read         BOOLEAN DEFAULT false,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ACTIVITY LOG
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id        UUID REFERENCES profiles(id),
  entity_type     VARCHAR(100) NOT NULL,      -- 'conversation' | 'lead' | 'contact' etc.
  entity_id       UUID NOT NULL,
  action          VARCHAR(100) NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes (Performance-Critical)

```sql
-- Conversations
CREATE INDEX idx_conversations_workspace_status ON conversations(workspace_id, status);
CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_agent ON conversations(assigned_agent_id);
CREATE INDEX idx_conversations_last_msg ON conversations(last_message_at DESC);

-- Messages
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_whatsapp_id ON messages(whatsapp_msg_id);
CREATE INDEX idx_messages_workspace ON messages(workspace_id);

-- Contacts
CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_phone ON contacts(workspace_id, phone);
CREATE INDEX idx_contacts_tags ON contacts USING gin(tags);

-- Leads
CREATE INDEX idx_leads_workspace_stage ON leads(workspace_id, stage);
CREATE INDEX idx_leads_agent ON leads(assigned_agent_id);

-- Notifications
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

-- Full-text search
CREATE INDEX idx_contacts_fts ON contacts USING gin(to_tsvector('english', coalesce(name, '') || ' ' || phone));
CREATE INDEX idx_conversations_fts ON conversations USING gin(to_tsvector('english', coalesce(last_message, '')));
```

### Row Level Security (RLS)

```sql
-- Enable RLS on all tenant tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Workspace isolation policy
CREATE POLICY "workspace_isolation" ON conversations
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Agents can only update assigned conversations
CREATE POLICY "agent_conversation_update" ON conversations
  FOR UPDATE USING (
    assigned_agent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members
      WHERE user_id = auth.uid()
      AND workspace_id = conversations.workspace_id
      AND role IN ('admin', 'manager', 'super_admin')
    )
  );

-- Notifications: user can only see own
CREATE POLICY "own_notifications" ON notifications
  FOR ALL USING (user_id = auth.uid());
```

---

## 7. Authentication & Authorization

### Auth Flow

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Login Page  │───▶│ Supabase Auth│───▶│  JWT Token   │───▶│  Middleware  │
│             │    │  (Email/Pass)│    │  + Claims    │    │  Validation  │
└─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                               │
                                        workspace_id claim
                                        role claim
                                        permissions claim
```

### JWT Custom Claims (via Supabase Hook)

```typescript
interface JWTClaims {
  sub: string;                    // user ID
  email: string;
  workspace_id: string;           // active workspace
  role: UserRole;                 // workspace role
  permissions: Permission[];      // granular permissions
  workspace_slug: string;
}
```

### Permission Matrix

| Permission | Super Admin | Admin | Manager | Agent |
|-----------|:-----------:|:-----:|:-------:|:-----:|
| manage_workspace | ✅ | ✅ | ❌ | ❌ |
| manage_team | ✅ | ✅ | ✅ | ❌ |
| create_campaigns | ✅ | ✅ | ✅ | ❌ |
| view_analytics | ✅ | ✅ | ✅ | ❌ |
| manage_templates | ✅ | ✅ | ✅ | ❌ |
| handle_conversations | ✅ | ✅ | ✅ | ✅ |
| manage_contacts | ✅ | ✅ | ✅ | ✅ |
| manage_leads | ✅ | ✅ | ✅ | ✅ |
| view_all_conversations | ✅ | ✅ | ✅ | ❌ |
| billing_management | ✅ | ✅ | ❌ | ❌ |

### Next.js Middleware (Route Protection)

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Public routes bypass
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }
  
  const session = await getSession(request);
  
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // Role-based route guards
  if (pathname.startsWith('/settings/billing') && session.role === 'agent') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  return NextResponse.next();
}
```

---

## 8. Core Modules — Detailed Specs

### 8.1 Dashboard Module

**Purpose:** Central command center showing real-time KPIs, team health, and actionable insights.

**Components:**
- `<DashboardShell>` — Grid layout with responsive breakpoints
- `<KPICard>` — Animated metric display with trend indicators
- `<ConversationVelocityChart>` — Real-time message throughput
- `<TeamStatusPanel>` — Live agent availability map
- `<RecentActivityFeed>` — Supabase Realtime-powered feed
- `<QuickActions>` — Command shortcuts for power users
- `<CampaignStatusWidget>` — Active campaign health

**Data Sources:** Supabase Realtime subscriptions on `conversations`, `messages`, aggregated views.

---

### 8.2 Real-Time Chat System

**Three-Panel Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  CONVERSATIONS LIST  │    CHAT WINDOW     │ CONTACT PANEL│
│  (320px fixed)       │    (flex-1)        │  (340px)     │
│                      │                    │              │
│  [Filter Bar]        │  [Message Header]  │  [Profile]   │
│  ─────────────────   │  ─────────────────  │  [Tags]      │
│  [Chat Item]         │  [Message Feed]    │  [CRM Lead]  │
│  [Chat Item]         │  [Typing Indic.]   │  [Timeline]  │
│  [Chat Item]         │  ─────────────────  │  [Notes]     │
│  [Chat Item]         │  [Message Input]   │  [Actions]   │
└─────────────────────────────────────────────────────────┘
```

**Key Components:**

```typescript
// ConversationList — Virtualized for 10k+ conversations
<VirtualizedList
  items={conversations}
  itemHeight={80}
  renderItem={(conv) => <ConversationItem key={conv.id} data={conv} />}
/>

// MessageFeed — Reverse infinite scroll
<InfiniteMessageFeed
  conversationId={id}
  pageSize={50}
  onLoadMore={fetchPreviousMessages}
/>

// MessageInput — Rich editor
<MessageComposer
  onSend={sendMessage}
  onAttach={uploadMedia}
  onTemplate={openTemplateSelector}
  onNote={addInternalNote}
  features={['emoji', 'media', 'template', 'note', 'mention']}
/>
```

**Realtime Subscriptions:**

```typescript
// Subscribe to new messages
const channel = supabase
  .channel(`conversation:${conversationId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `conversation_id=eq.${conversationId}`
  }, handleNewMessage)
  .on('presence', { event: 'sync' }, handlePresenceSync)
  .subscribe();
```

---

### 8.3 CRM Pipeline Module

**Kanban Board Architecture:**

```typescript
interface Pipeline {
  stages: Stage[];
  leads: Record<LeadStage, Lead[]>;
}

// Drag-and-drop with @dnd-kit/core
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragEnd={handleStageMutation}
>
  <SortableContext items={stageIds}>
    {stages.map(stage => (
      <KanbanColumn key={stage.id} stage={stage} leads={pipeline[stage.id]} />
    ))}
  </SortableContext>
</DndContext>
```

**Lead Stages & Transitions:**

```
NEW → CONTACTED → FOLLOW_UP → INTERESTED → CONVERTED
                                         ↘ LOST
```

**Lead Detail Drawer:**
- Full contact profile
- Conversation history
- Activity timeline
- Follow-up scheduler
- Revenue tracking
- Notes & attachments

---

### 8.4 Campaign / Broadcast Module

**Campaign Builder Flow:**

```
Step 1: Name & Setup
    ↓
Step 2: Select Template
    ↓
Step 3: Define Audience
  ├─ All Contacts
  ├─ Tag-based Segment
  ├─ Custom Filter
  └─ CSV Upload
    ↓
Step 4: Schedule or Send Now
    ↓
Step 5: Review & Confirm
    ↓
Step 6: Monitor Analytics
```

**Queue Architecture:**

```typescript
// Campaign processor (Edge Function)
export async function processCampaign(campaignId: string) {
  const campaign = await getCampaign(campaignId);
  const contacts = await getAudienceContacts(campaign.audience_filter);
  
  // Batch into chunks of 50 (WhatsApp rate limit: 80 msg/s)
  const batches = chunk(contacts, 50);
  
  for (const batch of batches) {
    await queue.addBulk(
      batch.map(contact => ({
        data: { campaignId, contactId: contact.id },
        opts: { delay: calculateDelay(), attempts: 3 }
      }))
    );
  }
}
```

---

### 8.5 Contact Management

**Features:**
- Smart deduplication on import (phone number matching)
- CSV import with field mapping wizard
- Segment builder with AND/OR filter logic
- Contact scoring based on interaction history
- GDPR opt-out management

**Import Pipeline:**

```
CSV Upload → Validate Headers → Map Fields → Deduplicate
    → Preview (50 rows) → Confirm → Background Import
    → Progress WebSocket → Import Report
```

---

### 8.6 Template Management

**Template Builder:**
- Rich text editor with variable insertion `{{1}}`, `{{2}}`
- Live phone preview (renders as WhatsApp message)
- Header type selector (Text / Image / Video / Document)
- Button builder (CTA, Quick Reply, URL)
- Multi-language support
- Meta submission integration

**Template Categories:**
- **Authentication** — OTPs, verification codes
- **Marketing** — Promotions, announcements
- **Utility** — Order updates, reminders

---

### 8.7 Analytics Module

**Dashboard Sections:**

| Section | Charts | Data |
|---------|--------|------|
| Overview | KPI cards, trend lines | Daily/Weekly/Monthly |
| Conversations | Volume heatmap, resolution time | By agent, by label |
| Messages | Delivery funnel | Sent → Delivered → Read |
| Campaigns | Performance table | Per-campaign metrics |
| Team | Agent leaderboard | Response time, CSAT |
| Leads | Pipeline velocity | Stage conversion rates |

**Chart Library:** Recharts (animated, responsive, custom tooltips)

---

### 8.8 Notification System

**Notification Types:**

```typescript
type NotificationType =
  | 'new_message'
  | 'conversation_assigned'
  | 'conversation_resolved'
  | 'lead_updated'
  | 'campaign_completed'
  | 'team_mention'
  | 'system_alert';
```

**Delivery Channels:**
1. In-app notification center (real-time)
2. Browser Push Notifications (Service Worker)
3. Sound alerts (configurable per type)
4. Email digest (configurable frequency)

---

## 9. Real-time Architecture

### Supabase Realtime Channels

```typescript
// Channel naming convention: {entity}:{id}:{workspace_id}
const CHANNELS = {
  WORKSPACE: (wsId: string) => `workspace:${wsId}`,
  CONVERSATION: (convId: string) => `conversation:${convId}`,
  AGENT_PRESENCE: (wsId: string) => `presence:agents:${wsId}`,
  NOTIFICATIONS: (userId: string) => `notifications:${userId}`,
  CAMPAIGN: (campId: string) => `campaign:${campId}`,
} as const;
```

### Presence System

```typescript
// Track agent online status
const presenceChannel = supabase.channel(CHANNELS.AGENT_PRESENCE(workspaceId));

presenceChannel
  .on('presence', { event: 'sync' }, () => {
    const state = presenceChannel.presenceState();
    updateOnlineAgents(state);
  })
  .on('presence', { event: 'join' }, ({ newPresences }) => {
    markAgentsOnline(newPresences);
  })
  .on('presence', { event: 'leave' }, ({ leftPresences }) => {
    markAgentsOffline(leftPresences);
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await presenceChannel.track({
        user_id: currentUser.id,
        status: 'online',
        current_conversation: null
      });
    }
  });
```

### Typing Indicators

```typescript
// Broadcast typing event (ephemeral, no DB write)
const sendTypingIndicator = debounce(async () => {
  await supabase.channel(`conversation:${convId}`)
    .send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: agentId, is_typing: true }
    });
}, 300);
```

---

## 10. AI Agent Architecture

### Multi-Agent System Design

```
┌─────────────────────────────────────────────────────────┐
│                    AGENT ORCHESTRATOR                    │
│                                                         │
│  Incoming Message → Intent Classifier → Route to Agent  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  FAQ Agent   │  │  Sales Agent │  │  Human Esc.  │  │
│  │  (OpenAI)    │  │  (Custom)    │  │  (Handoff)   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### AI Integration Points

| Feature | Technology | Description |
|---------|-----------|-------------|
| Intent Classification | OpenAI GPT-4o mini | Classify message intent |
| Auto-Reply | OpenAI GPT-4o | Generate contextual replies |
| Lead Scoring | Custom ML | Score leads from conversation |
| Sentiment Analysis | OpenAI | Detect customer sentiment |
| Smart Routing | Rule Engine + AI | Route to best available agent |
| Summary Generation | GPT-4o | Summarize long conversations |

### Agent Configuration Schema

```typescript
interface AIAgent {
  id: string;
  workspace_id: string;
  name: string;
  type: 'faq' | 'sales' | 'support' | 'custom';
  model: string;
  system_prompt: string;
  triggers: AgentTrigger[];
  actions: AgentAction[];
  escalation_rules: EscalationRule[];
  is_active: boolean;
}
```

---

## 11. API Design Standards

### RESTful Conventions

```
GET    /api/conversations              — List (paginated)
GET    /api/conversations/:id          — Get single
POST   /api/conversations              — Create
PATCH  /api/conversations/:id          — Update (partial)
DELETE /api/conversations/:id          — Soft delete

POST   /api/conversations/:id/assign   — Assign to agent
POST   /api/conversations/:id/resolve  — Resolve
POST   /api/conversations/:id/messages — Send message
```

### Standard Response Envelope

```typescript
// Success
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 50,
    "total": 1240,
    "has_more": true
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Phone number is invalid",
    "details": [{ "field": "phone", "message": "Must be E.164 format" }]
  }
}
```

### Rate Limiting

```typescript
// API route rate limiting via Upstash Redis
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'),
  analytics: true,
});
```

### WhatsApp Webhook Handler

```typescript
// POST /api/webhooks/whatsapp
export async function POST(req: Request) {
  // Verify webhook signature
  const signature = req.headers.get('x-hub-signature-256');
  if (!verifySignature(await req.text(), signature, WEBHOOK_SECRET)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  const body: WhatsAppWebhookPayload = await req.json();
  
  // Process in background (respond 200 immediately to Meta)
  EdgeRuntime.waitUntil(processWebhookPayload(body));
  
  return Response.json({ success: true });
}
```

---

## 12. Design System & UI/UX Principles

### Color System

```typescript
// tailwind.config.ts
const colors = {
  brand: {
    50:  '#f0f9ff',
    100: '#e0f2fe',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    900: '#0c4a6e',
  },
  // Semantic tokens
  surface: {
    primary:   'hsl(var(--surface-primary))',
    secondary: 'hsl(var(--surface-secondary))',
    elevated:  'hsl(var(--surface-elevated))',
  }
}
```

### Typography Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `display-xl` | 48px | 800 | 1.1 | Hero headings |
| `display-lg` | 36px | 700 | 1.2 | Page titles |
| `heading-lg` | 24px | 600 | 1.3 | Section headers |
| `heading-md` | 18px | 600 | 1.4 | Card titles |
| `body-lg` | 16px | 400 | 1.6 | Primary body |
| `body-md` | 14px | 400 | 1.5 | Secondary body |
| `label` | 12px | 500 | 1.4 | Labels, badges |
| `caption` | 11px | 400 | 1.3 | Meta info |

### Animation Principles

```typescript
// animations/variants.ts
export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
  exit: { opacity: 0, y: -8 }
};

export const staggerChildren = {
  animate: { transition: { staggerChildren: 0.06 } }
};

export const slideInFromRight = {
  initial: { x: '100%', opacity: 0 },
  animate: { x: 0, opacity: 1, transition: { type: 'spring', damping: 25, stiffness: 300 } },
  exit: { x: '100%', opacity: 0 }
};

export const messageAppear = {
  initial: { opacity: 0, scale: 0.95, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2 } }
};
```

### Component Architecture Rules

1. **Atomic Design** — Atom → Molecule → Organism → Template → Page
2. **Compound Components** — Context-sharing parent/child patterns
3. **Headless Logic** — Separate behavior (hooks) from presentation
4. **Zero Props Drilling** — Zustand stores for cross-component state
5. **Skeleton-First Loading** — Every async component has a skeleton variant

---

## 13. State Management Architecture

### Store Topology

```
┌─────────────────────────────────────────────────────────┐
│                    ZUSTAND STORES                        │
│                                                         │
│  auth.store        workspace.store    ui.store          │
│  ─ user            ─ workspace        ─ sidebar open    │
│  ─ session         ─ members          ─ active modal    │
│  ─ permissions     ─ settings         ─ theme           │
│                                                         │
│  conversation.store            notification.store        │
│  ─ active conversation         ─ notifications[]        │
│  ─ messages cache              ─ unread count           │
│  ─ typing users                ─ sound enabled          │
│  ─ online agents                                        │
└─────────────────────────────────────────────────────────┘
              ↕ TanStack Query for server state
┌─────────────────────────────────────────────────────────┐
│               TANSTACK QUERY CACHE                       │
│                                                         │
│  ['conversations', filters]   ['contacts', workspaceId] │
│  ['messages', convId, page]   ['leads', stage]          │
│  ['campaigns', workspaceId]   ['analytics', range]      │
│  ['templates', workspaceId]   ['team', workspaceId]     │
└─────────────────────────────────────────────────────────┘
```

### Optimistic Updates Pattern

```typescript
// Optimistic message send
const sendMessage = useMutation({
  mutationFn: api.messages.send,
  onMutate: async (newMessage) => {
    await queryClient.cancelQueries(['messages', convId]);
    const previous = queryClient.getQueryData(['messages', convId]);
    
    // Optimistically inject message
    queryClient.setQueryData(['messages', convId], (old) => ({
      ...old,
      pages: old.pages.map((page, i) => 
        i === 0 ? { ...page, data: [optimisticMessage, ...page.data] } : page
      )
    }));
    
    return { previous };
  },
  onError: (_, __, context) => {
    queryClient.setQueryData(['messages', convId], context.previous);
    toast.error('Message failed to send');
  },
  onSettled: () => {
    queryClient.invalidateQueries(['messages', convId]);
  }
});
```

---

## 14. Security Architecture

### Security Layers

```
REQUEST
  │
  ▼
[Cloudflare WAF + DDoS]
  │
  ▼
[Vercel Edge Middleware — Auth Check]
  │
  ▼
[Next.js API Route — Rate Limit + Input Validation (Zod)]
  │
  ▼
[Supabase RLS — Row-Level Tenant Isolation]
  │
  ▼
[PostgreSQL — Encrypted at rest]
```

### Zod Validation Schemas

```typescript
// schemas/message.schema.ts
export const sendMessageSchema = z.object({
  conversation_id: z.string().uuid(),
  type: z.enum(['text', 'template', 'image', 'document']),
  content: z.string().max(4096).optional(),
  template_id: z.string().uuid().optional(),
  template_variables: z.record(z.string()).optional(),
  media_url: z.string().url().optional(),
}).refine(data => data.content || data.template_id, {
  message: 'Either content or template_id is required'
});

export const sendMessageHandler = async (req: Request) => {
  const body = await req.json();
  const validated = sendMessageSchema.safeParse(body);
  
  if (!validated.success) {
    return Response.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: validated.error.issues }
    }, { status: 400 });
  }
  // ...proceed
};
```

### Security Checklist

- [x] Supabase RLS on all tenant tables
- [x] JWT expiry + refresh token rotation
- [x] CSRF protection via SameSite cookies
- [x] XSS prevention (Content Security Policy headers)
- [x] SQL injection prevention (parameterized queries via Prisma/Supabase)
- [x] Rate limiting on all public API endpoints
- [x] WhatsApp webhook signature verification
- [x] Encrypted storage for WABA access tokens
- [x] Input sanitization on all user content
- [x] Audit logging for sensitive operations

---

## 15. Performance Engineering

### Frontend Performance Budget

| Metric | Target | Critical |
|--------|--------|---------|
| FCP | < 1.2s | < 1.8s |
| LCP | < 2.5s | < 4.0s |
| TBT | < 150ms | < 300ms |
| CLS | < 0.1 | < 0.25 |
| Bundle (initial) | < 150KB | < 250KB |

### Optimization Techniques

```typescript
// 1. Dynamic imports for heavy modules
const KanbanBoard = dynamic(() => import('@/modules/crm/components/KanbanBoard'), {
  loading: () => <KanbanSkeleton />,
  ssr: false
});

// 2. Virtualized conversation list
import { useVirtualizer } from '@tanstack/react-virtual';

// 3. Image optimization
<Image
  src={contact.avatar_url}
  width={40}
  height={40}
  alt={contact.name}
  placeholder="blur"
  blurDataURL={generateBlurHash(contact.avatar_url)}
/>

// 4. Memoized expensive computations
const sortedConversations = useMemo(() =>
  conversations.sort((a, b) => 
    new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  ),
  [conversations]
);
```

### Database Query Optimization

```sql
-- Use materialized views for analytics
CREATE MATERIALIZED VIEW conversation_stats_daily AS
SELECT
  workspace_id,
  DATE_TRUNC('day', created_at) AS date,
  COUNT(*) AS total_conversations,
  COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_count,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) AS avg_resolution_hours
FROM conversations
GROUP BY workspace_id, DATE_TRUNC('day', created_at);

-- Refresh periodically
REFRESH MATERIALIZED VIEW CONCURRENTLY conversation_stats_daily;
```

---

## 16. DevOps & Infrastructure

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run test

  deploy-preview:
    if: github.event_name == 'pull_request'
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}

  deploy-production:
    if: github.ref == 'refs/heads/main'
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-args: '--prod'
```

### Supabase Migration Strategy

```bash
# Generate migration
supabase migration new add_campaign_analytics_table

# Apply locally
supabase db push

# Apply to production
supabase db push --db-url $SUPABASE_PROD_URL

# Type generation
supabase gen types typescript --project-id $PROJECT_ID > types/database.types.ts
```

---

## 17. Testing Strategy

### Test Pyramid

```
         ┌────────────────┐
         │   E2E Tests    │  (Playwright — critical flows)
         │    ~20%        │
        ┌┴────────────────┴┐
        │ Integration Tests │  (Vitest + Supabase local)
        │      ~30%         │
       ┌┴───────────────────┴┐
       │     Unit Tests       │  (Vitest — pure functions, hooks)
       │        ~50%          │
       └──────────────────────┘
```

### Critical E2E Test Flows

1. Full authentication flow (signup → verify → login → workspace)
2. Send message flow (select contact → open conversation → send → verify delivery)
3. Create campaign (build → select audience → schedule → monitor)
4. CRM pipeline (create lead → move stages → convert)
5. Team management (invite member → assign role → remove)

---

## 18. Multi-Tenancy Architecture

### Workspace Isolation Model

```
Workspace A (workspace_id = uuid-a)
  └── Members: agent_1, agent_2, manager_1
  └── Conversations: only workspace A's
  └── Contacts: only workspace A's
  └── Messages: only workspace A's

Workspace B (workspace_id = uuid-b)
  └── Members: agent_3, admin_1
  └── Conversations: only workspace B's
  └── NO cross-workspace data leakage (enforced by RLS)
```

### Workspace Switching

```typescript
// workspace.store.ts
const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  activeWorkspace: null,
  workspaces: [],
  
  switchWorkspace: async (workspaceId: string) => {
    // Invalidate all cached queries
    await queryClient.invalidateQueries();
    
    // Update active workspace
    set({ activeWorkspace: workspaceId });
    
    // Unsubscribe all realtime channels
    supabase.removeAllChannels();
    
    // Re-initialize realtime for new workspace
    initializeRealtimeChannels(workspaceId);
  }
}));
```

---

## 19. WhatsApp Business API Integration

### Meta Graph API Flows

```
Send Message:
POST /v19.0/{phone-number-id}/messages
{
  "messaging_product": "whatsapp",
  "to": "{{phone_number}}",
  "type": "template",
  "template": {
    "name": "{{template_name}}",
    "language": { "code": "en_US" },
    "components": [...]
  }
}

Send Media:
1. Upload to Meta → get media_id
2. Reference media_id in message payload

Webhook Events:
- messages (inbound)
- message_status (sent/delivered/read/failed)
- template_status (approved/rejected)
```

### Webhook Processing Pipeline

```typescript
// Edge Function: process-whatsapp-webhook
async function processWebhookPayload(payload: WAWebhookPayload) {
  const { entry } = payload;
  
  for (const entry of entries) {
    for (const change of entry.changes) {
      const { messages, statuses } = change.value;
      
      // New inbound messages
      if (messages) {
        await Promise.all(messages.map(processInboundMessage));
      }
      
      // Message status updates
      if (statuses) {
        await Promise.all(statuses.map(updateMessageStatus));
      }
    }
  }
}

async function processInboundMessage(message: WAMessage) {
  // 1. Find or create contact
  const contact = await upsertContact(message.from);
  
  // 2. Find or create conversation
  const conversation = await upsertConversation(contact.id);
  
  // 3. Store message
  const savedMessage = await createMessage({
    conversation_id: conversation.id,
    content: message.text?.body,
    direction: 'inbound',
    whatsapp_msg_id: message.id
  });
  
  // 4. Broadcast via Supabase Realtime (auto-handled by DB)
  // 5. Trigger AI agent if configured
  await maybeRouteToAIAgent(conversation, savedMessage);
  
  // 6. Send notification to assigned agent
  await notifyAgent(conversation.assigned_agent_id, savedMessage);
}
```

---

## 20. Analytics & Observability

### Metrics Collection

```typescript
// Structured logging with Axiom
import { Logger } from '@axiomhq/logging';

const logger = new Logger({
  token: process.env.AXIOM_TOKEN,
  dataset: 'agentix-prod'
});

// Log critical events
logger.info('message.sent', {
  workspace_id,
  conversation_id,
  message_type,
  latency_ms: Date.now() - startTime
});
```

### Error Monitoring (Sentry)

```typescript
// Capture conversation send failures
Sentry.captureException(error, {
  tags: {
    workspace_id,
    module: 'whatsapp-send',
  },
  extra: {
    conversation_id,
    message_type
  }
});
```

### Analytics Views

```sql
-- Agent performance view
CREATE VIEW agent_performance AS
SELECT
  wm.user_id,
  p.full_name,
  COUNT(DISTINCT c.id) AS total_conversations,
  AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at))/60) AS avg_resolution_minutes,
  COUNT(m.id) AS total_messages_sent
FROM workspace_members wm
JOIN profiles p ON p.id = wm.user_id
LEFT JOIN conversations c ON c.assigned_agent_id = wm.user_id
LEFT JOIN messages m ON m.sender_id = wm.user_id AND m.direction = 'outbound'
GROUP BY wm.user_id, p.full_name;
```

---

## 21. Environment Configuration

```bash
# .env.local.example

# ─── Supabase ───────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ─── WhatsApp Business API ──────────────────────
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_WABA_ID=your-waba-id
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_WEBHOOK_SECRET=your-webhook-secret
META_APP_SECRET=your-app-secret

# ─── AI (OpenAI) ────────────────────────────────
OPENAI_API_KEY=sk-your-openai-key

# ─── Queue (Upstash Redis) ──────────────────────
UPSTASH_REDIS_REST_URL=your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# ─── Monitoring ─────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
AXIOM_TOKEN=your-axiom-token
AXIOM_DATASET=agentix-prod

# ─── App ─────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://app.agentix.io
NEXTAUTH_SECRET=your-nextauth-secret
CRON_SECRET=your-cron-secret
```

---

## 22. Deployment Runbook

### Initial Setup

```bash
# 1. Clone & install
git clone https://github.com/your-org/agentix.git
cd agentix
npm install

# 2. Supabase setup
npx supabase init
npx supabase start          # Local dev
npx supabase db push        # Apply migrations
npx supabase gen types typescript --local > types/database.types.ts

# 3. Configure environment
cp .env.local.example .env.local
# Fill in all required values

# 4. Run development
npm run dev

# 5. Deploy to Vercel
vercel --prod
```

### Production Checklist

```
Pre-Deploy:
  □ All environment variables set in Vercel dashboard
  □ Supabase production project configured
  □ RLS policies applied and tested
  □ WhatsApp webhook registered with Meta
  □ Domain configured in Vercel + Supabase Auth

Post-Deploy:
  □ Verify webhook delivery from Meta
  □ Test auth flow end-to-end
  □ Confirm Realtime subscriptions working
  □ Check Sentry error tracking active
  □ Validate campaign queue processing
  □ Load test with k6 (100 concurrent users)
```

---

## 23. Roadmap & Versioning

### Phase 1 — Foundation (Weeks 1–6)
- [x] Auth system (login, signup, roles)
- [x] Workspace management
- [x] Real-time chat system
- [x] Contact management (CRUD + import)
- [x] Basic dashboard

### Phase 2 — Core Product (Weeks 7–12)
- [ ] CRM pipeline (Kanban)
- [ ] Template management
- [ ] Bulk campaign system
- [ ] Team management + presence
- [ ] Analytics foundation

### Phase 3 — Intelligence (Weeks 13–18)
- [ ] AI agent builder
- [ ] Smart routing
- [ ] Conversation summaries
- [ ] Lead scoring
- [ ] Sentiment detection

### Phase 4 — Scale (Weeks 19–24)
- [ ] Multi-channel (Instagram, Telegram)
- [ ] Advanced analytics
- [ ] Zapier/Make integrations
- [ ] Mobile app (React Native)
- [ ] Public API + webhooks
- [ ] White-label option

### Semantic Versioning

```
MAJOR.MINOR.PATCH
  │      │      └── Bug fixes
  │      └───────── New features (backward compatible)
  └──────────────── Breaking changes

v1.0.0 — Phase 1 complete
v1.1.0 — CRM module added
v1.2.0 — Campaign system
v2.0.0 — AI agent system (major feature)
```

---

## 24. Engineering Standards & Code Quality

### TypeScript Conventions

```typescript
// ✅ Always use explicit return types on service functions
async function getConversation(id: string): Promise<Conversation | null> {}

// ✅ Use discriminated unions for complex state
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

// ✅ Prefer `interface` for object shapes, `type` for unions/aliases
interface MessagePayload {
  content: string;
  type: MessageType;
}

// ✅ Never use `any` — use `unknown` and narrow
function processWebhook(payload: unknown) {
  if (!isWebhookPayload(payload)) throw new Error('Invalid payload');
  // ... now payload is typed
}
```

### File & Component Conventions

```
ComponentName/
├── index.tsx          — Main component (default export)
├── ComponentName.tsx  — Implementation (named export)
├── types.ts           — Local types
├── hooks.ts           — Component-specific hooks
└── styles.ts          — Tailwind variant configs (cva)
```

### Commit Convention (Conventional Commits)

```
feat(conversations): add typing indicator with debounce
fix(campaigns): handle failed message retry edge case
perf(messages): virtualize list for 10k+ messages
chore(deps): upgrade framer-motion to 11.x
docs(api): update webhook handler documentation
```

### Code Review Checklist

```
Performance:
  □ No unnecessary re-renders (memo/useCallback where needed)
  □ No N+1 queries
  □ Heavy operations are async/deferred

Security:
  □ All inputs validated with Zod
  □ No sensitive data in client-side logs
  □ RLS policies not bypassed

Accessibility:
  □ All interactive elements keyboard-navigable
  □ ARIA labels on icon-only buttons
  □ Color contrast ratio ≥ 4.5:1
```

---

## Appendix A — Supabase Edge Functions

### Function: `process-campaign`

```typescript
// supabase/functions/process-campaign/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const { campaign_id } = await req.json();
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  // Fetch campaign with workspace context
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*, templates(*), workspaces(waba_id, access_token)')
    .eq('id', campaign_id)
    .single();
  
  // Get target audience
  const contacts = await resolveAudience(supabase, campaign);
  
  // Update status to 'running'
  await supabase.from('campaigns').update({ 
    status: 'running',
    started_at: new Date().toISOString(),
    total_recipients: contacts.length
  }).eq('id', campaign_id);
  
  // Process in batches of 50
  for (const batch of chunk(contacts, 50)) {
    await sendBatch(batch, campaign);
    await sleep(1000); // Respect Meta rate limits
  }
  
  // Mark complete
  await supabase.from('campaigns').update({
    status: 'completed',
    completed_at: new Date().toISOString()
  }).eq('id', campaign_id);
  
  return new Response(JSON.stringify({ success: true }));
});
```

---

## Appendix B — Key Dependencies

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "@supabase/supabase-js": "^2.45.0",
    "@supabase/ssr": "^0.5.0",
    "framer-motion": "^11.0.0",
    "zustand": "^5.0.0",
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-virtual": "^3.0.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "recharts": "^2.12.0",
    "react-hook-form": "^7.52.0",
    "zod": "^3.23.0",
    "socket.io-client": "^4.7.0",
    "date-fns": "^3.6.0",
    "@upstash/redis": "^1.31.0",
    "@upstash/ratelimit": "^2.0.0",
    "openai": "^4.52.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.4.0",
    "cmdk": "^1.0.0",
    "sonner": "^1.5.0",
    "papaparse": "^5.4.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "prisma": "^5.17.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.45.0",
    "supabase": "^1.192.0"
  }
}
```

---

*Built with ❤️ by the Agentix Engineering Team*  
*Document version: 2.0.0 | Generated: 2025*
