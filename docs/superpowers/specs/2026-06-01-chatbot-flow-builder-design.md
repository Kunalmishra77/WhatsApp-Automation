# Chatbot Flow Builder — Design Spec
**Date:** 2026-06-01  
**Scope:** Agentix WhatsApp Automation Platform — Tier 1 Feature #4

---

## 1. Overview

A drag-and-drop visual flow builder that lets workspace operators create automated WhatsApp conversation flows. Flows are executed in real-time by the webhook handler when a matching inbound message arrives.

---

## 2. Architecture

### Data Layer
Two Supabase tables (migration already created at `database/migrations/005_chatbot_flows.sql`):
- **`chatbot_flows`** — stores flow definition (name, trigger, nodes JSONB, edges JSONB, is_active)
- **`flow_sessions`** — tracks active user sessions mid-flow (current_node_id, status, context)

### Frontend Stack
- ReactFlow `^11.11.4` (already installed) for canvas
- TanStack Query hooks for data fetching/mutations
- Zustand (existing `useWorkspaceStore`) for workspace context
- shadcn/ui + TailwindCSS for all UI components

### Backend
- Next.js API routes following existing `createAdminClient()` + `requireWorkspacePermission()` pattern
- Flow engine (`lib/flow-engine.ts`) integrated into the existing webhook handler after inbox rules

---

## 3. Node Types (6 total)

| Type | Color | Icon | Description |
|---|---|---|---|
| `start` | Green | `Play` | Entry point — keyword or first_message trigger |
| `message` | Blue | `MessageSquare` | Send text to user, auto-advance |
| `question` | Purple | `HelpCircle` | Send text, wait for reply (N hours timeout) |
| `condition` | Amber | `GitBranch` | Branch on reply content — Yes/No outputs |
| `assign_agent` | Red | `UserCheck` | Handoff to human, send pre-handoff message |
| `end` | Gray | `Square` | End flow, optional farewell message |

### Node Data Shapes (TypeScript)
```typescript
type StartNodeData     = { label: string; triggerType: 'keyword'|'first_message'; triggerValue: string }
type MessageNodeData   = { label: string; message: string }
type QuestionNodeData  = { label: string; message: string; timeoutHours: number }
type ConditionNodeData = { label: string; keyword: string; matchType: 'contains'|'equals'|'starts_with' }
type AssignAgentData   = { label: string; message: string }
type EndNodeData       = { label: string; message: string }
```

---

## 4. File Structure

```
modules/flows/
  types/index.ts                   — FlowNodeType, FlowNodeData, FlowNode, FlowEdge, ChatbotFlow
  components/
    nodes/
      StartNode.tsx
      MessageNode.tsx
      QuestionNode.tsx
      ConditionNode.tsx
      AssignAgentNode.tsx
      EndNode.tsx
    NodeConfigPanel/index.tsx      — Slide-in edit panel (w-80, fixed right)
    FlowCanvas/index.tsx           — ReactFlow canvas with all node types registered
    AddNodeToolbar/index.tsx       — Floating left panel, buttons to add each node type
  hooks/
    useFlows.ts                    — useFlows, useFlow, useCreateFlow, useUpdateFlow, useDeleteFlow
  services/
    flow.service.ts                — fetch/create/update/delete flows via client Supabase

app/(dashboard)/flows/
  page.tsx                         — Flows list page
  [id]/page.tsx                    — Full-screen Flow Builder page

app/api/flows/
  route.ts                         — GET (list) + POST (create with default Start node)
  [id]/route.ts                    — GET + PATCH + DELETE

lib/flow-engine.ts                 — Execution engine called from webhook
```

---

## 5. Flow Builder Page Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ ← [Flow Name (editable)]        [Active toggle]   [Save button]  │  ← top bar
├────┬─────────────────────────────────────────────────┬───────────┤
│    │                                                 │           │
│ Add│         ReactFlow Canvas                        │  Config   │
│Node│                                                 │  Panel    │
│Tool│         (drag, connect, zoom, minimap)          │  (w-80,   │
│bar │                                                 │  slides   │
│    │                                                 │  in when  │
│    │                                                 │  selected)│
└────┴─────────────────────────────────────────────────┴───────────┘
```

---

## 6. Flow Execution Engine

The engine (`lib/flow-engine.ts`) is called from the webhook handler after inbox rules run. If it returns `true`, the AI auto-reply is skipped.

### Execution Logic
1. Check for active `flow_session` for this `conversation_id`
   - **Yes (resumed flow):** advance from `current_node_id` using user's reply
   - **No (new flow):** scan active flows for a trigger match (keyword or first_message)
2. Execute matched node:
   - `start`/`message`: send WhatsApp text, advance to next node automatically
   - `question`: send text, save `current_node_id`, pause (return — next message continues)
   - `condition`: compare user reply to keyword using matchType, follow `yes` or `no` edge
   - `assign_agent`: update conversation `status='pending'`, send pre-handoff message, end flow
   - `end`: send farewell message (if any), mark session `status='completed'`
3. Auto-advance through non-pausing nodes in a loop until hitting `question`/`end`/`assign_agent`
4. Persist `flow_session` state after each step

### Webhook Integration Point
```typescript
// In handleIncomingMessage(), after applyInboxRules():
const flowHandled = await processFlowForMessage(...)
if (flowHandled) return; // skip AI auto-reply
```

---

## 7. API Design

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/flows` | `manage_templates` | List workspace flows |
| POST | `/api/flows` | `manage_templates` | Create flow (with default Start node) |
| GET | `/api/flows/[id]` | `manage_templates` | Get flow with nodes+edges |
| PATCH | `/api/flows/[id]` | `manage_templates` | Update name/active/nodes/edges |
| DELETE | `/api/flows/[id]` | `manage_templates` | Delete flow |

---

## 8. Navigation
Add `{ href: '/flows', icon: GitBranch, label: 'Flows' }` to `NAV_ITEMS` in `components/layout/Sidebar/index.tsx`, after Templates.

---

## 9. TypeScript Constraints
- All components using ReactFlow must be `'use client'`
- ReactFlow CSS import: `import 'reactflow/dist/style.css'` in FlowCanvas
- ReactFlow container needs explicit height (`h-full` with parent `flex-1`)
- Use `NodeProps` from `reactflow` for node component typing
- Use `(supabase as any)` for untyped Supabase queries (consistent with codebase)
- Run `npx tsc --noEmit` to verify at the end

---

## 10. Out of Scope
- Interactive button messages (separate Tier 1 feature #5)
- Flow analytics / session history UI
- Flow versioning / rollback
- Multi-branch conditions (beyond Yes/No)
