# Tier 1 — Core Automation Features

> **Priority:** HIGH — Direct revenue impact, most-requested features
> **Status:** IN PROGRESS

---

## 1. Conversation Assignment + Agent Handoff ✅ NEXT

### What
- Agent ko conversation assign karo
- Bot se human agent ko escalate karna (keyword detect)
- Assigned conversations ka separate view

### DB Changes
`conversations.assigned_agent_id` already exists.

### API Routes to Build
- `PATCH /api/conversations/[id]/assign` — assign agent
- `PATCH /api/conversations/[id]/status` — change status (open/resolved/pending)

### UI Changes
- ConversationHeader mein "Assign" dropdown (workspace members list)
- ConversationList mein "My Conversations" tab
- Auto-assign trigger in webhook when keyword detected (e.g. "human", "agent", "help")

### Auto-Escalation Logic (in webhook handler)
```
Inbound message content check:
  IF contains "human" OR "agent" OR "help me" OR "speak to someone"
    → set conversation.assigned_agent_id = null (unassign bot)
    → set conversation.status = 'pending' (needs human)
    → create notification for agents
    → send auto-reply: "Connecting you to an agent..."
```

### Implementation Files
- `app/api/conversations/[id]/assign/route.ts` — NEW
- `app/api/conversations/[id]/status/route.ts` — NEW  
- `modules/conversations/components/ConversationHeader/index.tsx` — UPDATE
- `app/api/webhooks/whatsapp/route.ts` — UPDATE (add escalation check)
- `modules/conversations/hooks/useConversations.ts` — UPDATE (my-conversations filter)

---

## 2. Inbox Rules Engine

### What
"Agar message mein X hai → Y karo" automation rules
- Keyword match → label lagao
- Keyword match → auto-reply bhejo
- Keyword match → assign specific agent
- Keyword match → change conversation status
- Time-based rules (outside business hours → auto-reply)

### DB Table to Create
```sql
CREATE TABLE inbox_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  trigger_type  VARCHAR(50) NOT NULL, -- 'keyword', 'first_message', 'business_hours'
  trigger_value JSONB DEFAULT '{}',   -- { keywords: ['help', 'refund'], match: 'any' }
  actions       JSONB DEFAULT '[]',   -- [{ type: 'label', value: 'urgent' }, { type: 'assign', agent_id: '...' }]
  priority      INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### Action Types
| Type | Value | Effect |
|---|---|---|
| `label` | label name | conversation.labels mein add |
| `assign` | agent_id | conversation.assigned_agent_id set |
| `status` | status value | conversation.status change |
| `auto_reply` | message text | WhatsApp pe reply bhejo |
| `tag_contact` | tag name | contact.tags mein add |

### API Routes
- `GET  /api/inbox-rules` — list rules
- `POST /api/inbox-rules` — create rule
- `PUT  /api/inbox-rules/[id]` — update rule
- `DELETE /api/inbox-rules/[id]` — delete rule

### Execution (in webhook handler)
After inbound message saved → run rules engine:
```typescript
async function applyInboxRules(supabase, workspaceId, message, conversation, contact) {
  const rules = await fetchActiveRules(workspaceId);
  for (const rule of rules.sort(r => r.priority)) {
    if (await matchesTrigger(rule, message)) {
      await executeActions(rule.actions, conversation, contact);
    }
  }
}
```

### UI
- Settings → Inbox Rules page
- Rule builder: trigger selector + action builder
- Toggle on/off per rule

---

## 3. Broadcast Scheduler (Cron-based)

### What
Campaigns jo scheduled_at time pe automatically run ho jaayein. Ab "Send Now" manual hai.

### Approach: Vercel Cron Job
`vercel.json` mein cron configure karo:
```json
{
  "crons": [
    {
      "path": "/api/cron/run-scheduled-campaigns",
      "schedule": "* * * * *"
    }
  ]
}
```

### API Route
`GET /api/cron/run-scheduled-campaigns`
```typescript
// Runs every minute
// Finds campaigns where:
//   status = 'scheduled'
//   scheduled_at <= NOW()
//   scheduled_at >= NOW() - 5 minutes (grace period)
// Then calls campaign run logic for each
```

### Security
`CRON_SECRET` env var se verify karo (already in .env):
```typescript
if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
  return 401
}
```

### DB Changes
None — campaigns table already has `scheduled_at`, `status`.

### Implementation Files
- `app/api/cron/run-scheduled-campaigns/route.ts` — NEW
- `vercel.json` — ADD crons config

---

## 4. Chatbot Flow Builder

### What
Drag-drop visual editor se conversation flows banao.
- Welcome message → options dena
- User choice ke basis pe different paths
- Conditions add karo (time, keyword, tag)
- Exit to human agent

### DB Table
```sql
CREATE TABLE chatbot_flows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  is_active    BOOLEAN DEFAULT false,
  trigger_type VARCHAR(50) DEFAULT 'first_message', -- 'first_message', 'keyword', 'always'
  trigger_value TEXT,
  nodes        JSONB DEFAULT '[]', -- flow nodes array
  edges        JSONB DEFAULT '[]', -- connections between nodes
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### Node Types
```typescript
type NodeType = 
  | 'start'           // Entry point
  | 'message'         // Send text message
  | 'question'        // Ask question, wait for reply
  | 'condition'       // Branch based on user input
  | 'send_template'   // Send approved template
  | 'assign_agent'    // Handoff to human
  | 'set_tag'         // Tag the contact
  | 'end'             // End flow
```

### Library
Use `reactflow` (already popular, free):
```
npm install reactflow
```

### Files to Create
- `app/(dashboard)/flows/page.tsx`
- `modules/flows/components/FlowBuilder/index.tsx` — ReactFlow canvas
- `modules/flows/components/NodeTypes/` — custom node components
- `modules/flows/services/flow.service.ts`
- `app/api/flows/route.ts` + `app/api/flows/[id]/route.ts`
- Webhook integration: check active flow when message arrives

---

## 5. WhatsApp Interactive Messages

### What
Send karo:
- **Quick Reply buttons** — "Yes" / "No" / "More Info"
- **List messages** — dropdown menu with options
- **CTA buttons** — "Visit Website", "Call Now"

### API Route
`POST /api/messages/interactive`

### WhatsApp API Format

**Quick Reply:**
```json
{
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "Do you want to proceed?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "yes", "title": "Yes" }},
        { "type": "reply", "reply": { "id": "no", "title": "No" }}
      ]
    }
  }
}
```

**List Message:**
```json
{
  "type": "interactive",
  "interactive": {
    "type": "list",
    "body": { "text": "Choose an option:" },
    "action": {
      "button": "View Options",
      "sections": [{ "title": "Services", "rows": [...] }]
    }
  }
}
```

### UI Changes
- MessageInput mein "+ Attach" button add karo
- Dropdown: "Quick Reply" / "List Message" / "CTA Button"
- Modal to configure buttons/options

### Files
- `app/api/messages/interactive/route.ts` — NEW
- `modules/conversations/components/MessageInput/index.tsx` — UPDATE
- `modules/conversations/components/InteractiveMessageBuilder/` — NEW modal

---

## Implementation Order (Recommended)

1. **Conversation Assignment** — sabse simple, immediately useful ✅ START HERE
2. **Broadcast Scheduler** — cron job, 2-3 hours kaam
3. **Inbox Rules** — medium complexity
4. **Interactive Messages** — straightforward API
5. **Chatbot Flow Builder** — most complex (save for last in Tier 1)
