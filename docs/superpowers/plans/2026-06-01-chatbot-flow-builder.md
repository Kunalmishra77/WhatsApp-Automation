# Chatbot Flow Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full drag-and-drop chatbot flow builder for Agentix — visual editor, 6 custom ReactFlow node types, flow execution engine integrated into the WhatsApp webhook.

**Architecture:** Flows are stored as JSONB arrays of nodes and edges in Supabase (`chatbot_flows` table). The ReactFlow canvas edits these in-browser; a Save button PATCHes the API. When a WhatsApp message arrives, `lib/flow-engine.ts` scans active flows for a matching trigger, executes the flow node-by-node, and persists session state in `flow_sessions`. The engine returns `true` if it handled the message, suppressing the AI auto-reply.

**Tech Stack:** ReactFlow 11.11.4, TanStack Query 5, Zustand, shadcn/ui, TailwindCSS, Next.js 15 App Router, Supabase (admin client + RLS), lucide-react icons.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `modules/flows/types/index.ts` | CREATE | All TypeScript types for the flow system |
| `modules/flows/components/nodes/StartNode.tsx` | CREATE | Green start node component |
| `modules/flows/components/nodes/MessageNode.tsx` | CREATE | Blue message node component |
| `modules/flows/components/nodes/QuestionNode.tsx` | CREATE | Purple question node component |
| `modules/flows/components/nodes/ConditionNode.tsx` | CREATE | Amber condition node with Yes/No handles |
| `modules/flows/components/nodes/AssignAgentNode.tsx` | CREATE | Red agent handoff node component |
| `modules/flows/components/nodes/EndNode.tsx` | CREATE | Gray end node component |
| `modules/flows/components/NodeConfigPanel/index.tsx` | CREATE | Slide-in form panel for editing a selected node |
| `modules/flows/components/FlowCanvas/index.tsx` | CREATE | ReactFlow canvas with all node types registered |
| `modules/flows/components/AddNodeToolbar/index.tsx` | CREATE | Floating toolbar to add new nodes |
| `modules/flows/services/flow.service.ts` | CREATE | Client-side Supabase fetch/create/update/delete |
| `modules/flows/hooks/useFlows.ts` | CREATE | TanStack Query hooks for all flow mutations |
| `app/(dashboard)/flows/page.tsx` | CREATE | Flows list page |
| `app/(dashboard)/flows/[id]/page.tsx` | CREATE | Full-screen flow builder page |
| `app/api/flows/route.ts` | CREATE | GET list + POST create API |
| `app/api/flows/[id]/route.ts` | CREATE | GET + PATCH + DELETE API |
| `lib/flow-engine.ts` | CREATE | Flow execution engine |
| `app/api/webhooks/whatsapp/route.ts` | MODIFY | Add flow engine call after inbox rules |
| `components/layout/Sidebar/index.tsx` | MODIFY | Add Flows nav item |

---

## Task 1: TypeScript Types

**Files:**
- Create: `modules/flows/types/index.ts`

- [ ] **Step 1: Create the types file**

```typescript
// modules/flows/types/index.ts
import type { Node, Edge } from 'reactflow';

export type FlowNodeType =
  | 'start'
  | 'message'
  | 'question'
  | 'condition'
  | 'assign_agent'
  | 'end';

export interface StartNodeData {
  label: string;
  triggerType: 'keyword' | 'first_message';
  triggerValue: string;
  onEdit?: (id: string) => void;
}

export interface MessageNodeData {
  label: string;
  message: string;
  onEdit?: (id: string) => void;
}

export interface QuestionNodeData {
  label: string;
  message: string;
  timeoutHours: number;
  onEdit?: (id: string) => void;
}

export interface ConditionNodeData {
  label: string;
  keyword: string;
  matchType: 'contains' | 'equals' | 'starts_with';
  onEdit?: (id: string) => void;
}

export interface AssignAgentNodeData {
  label: string;
  message: string;
  onEdit?: (id: string) => void;
}

export interface EndNodeData {
  label: string;
  message: string;
  onEdit?: (id: string) => void;
}

export type FlowNodeData =
  | StartNodeData
  | MessageNodeData
  | QuestionNodeData
  | ConditionNodeData
  | AssignAgentNodeData
  | EndNodeData;

export type FlowNode = Node<FlowNodeData, FlowNodeType>;
export type FlowEdge = Edge;

export interface ChatbotFlow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_value: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/flows/types/index.ts
git commit -m "feat(flows): add TypeScript types for flow builder"
```

---

## Task 2: Node Components

**Files:**
- Create: `modules/flows/components/nodes/StartNode.tsx`
- Create: `modules/flows/components/nodes/MessageNode.tsx`
- Create: `modules/flows/components/nodes/QuestionNode.tsx`
- Create: `modules/flows/components/nodes/ConditionNode.tsx`
- Create: `modules/flows/components/nodes/AssignAgentNode.tsx`
- Create: `modules/flows/components/nodes/EndNode.tsx`

Each node uses ReactFlow's `Handle` component for connections and has:
- A colored left border (via className)
- A small lucide-react icon
- A pencil icon that calls `data.onEdit?.(id)`

- [ ] **Step 1: Create StartNode**

```tsx
// modules/flows/components/nodes/StartNode.tsx
'use client';

import { Handle, Position, type NodeProps } from 'reactflow';
import { Play, Pencil } from 'lucide-react';
import type { StartNodeData } from '../../types';

export function StartNode({ id, data }: NodeProps<StartNodeData>) {
  return (
    <div className="relative w-56 rounded-lg border border-green-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 rounded-t-lg border-b border-green-100 bg-green-50 px-3 py-2">
        <Play className="h-3.5 w-3.5 text-green-600" />
        <span className="flex-1 text-xs font-semibold text-green-700">{data.label}</span>
        <button
          onClick={() => data.onEdit?.(id)}
          className="rounded p-0.5 text-green-500 hover:bg-green-100"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
      <div className="px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium">Trigger:</span>{' '}
        {data.triggerType === 'keyword'
          ? `Keyword: "${data.triggerValue}"`
          : 'First message'}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-green-400" />
    </div>
  );
}
```

- [ ] **Step 2: Create MessageNode**

```tsx
// modules/flows/components/nodes/MessageNode.tsx
'use client';

import { Handle, Position, type NodeProps } from 'reactflow';
import { MessageSquare, Pencil } from 'lucide-react';
import type { MessageNodeData } from '../../types';

export function MessageNode({ id, data }: NodeProps<MessageNodeData>) {
  const preview = data.message.length > 60
    ? data.message.slice(0, 60) + '…'
    : data.message;

  return (
    <div className="relative w-56 rounded-lg border border-blue-200 bg-white shadow-sm">
      <Handle type="target" position={Position.Top} className="!bg-blue-400" />
      <div className="flex items-center gap-2 rounded-t-lg border-b border-blue-100 bg-blue-50 px-3 py-2">
        <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
        <span className="flex-1 text-xs font-semibold text-blue-700">{data.label}</span>
        <button
          onClick={() => data.onEdit?.(id)}
          className="rounded p-0.5 text-blue-500 hover:bg-blue-100"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
      <div className="px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
        {preview || <span className="italic">No message set</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400" />
    </div>
  );
}
```

- [ ] **Step 3: Create QuestionNode**

```tsx
// modules/flows/components/nodes/QuestionNode.tsx
'use client';

import { Handle, Position, type NodeProps } from 'reactflow';
import { HelpCircle, Pencil } from 'lucide-react';
import type { QuestionNodeData } from '../../types';

export function QuestionNode({ id, data }: NodeProps<QuestionNodeData>) {
  const preview = data.message.length > 60
    ? data.message.slice(0, 60) + '…'
    : data.message;

  return (
    <div className="relative w-56 rounded-lg border border-purple-200 bg-white shadow-sm">
      <Handle type="target" position={Position.Top} className="!bg-purple-400" />
      <div className="flex items-center gap-2 rounded-t-lg border-b border-purple-100 bg-purple-50 px-3 py-2">
        <HelpCircle className="h-3.5 w-3.5 text-purple-600" />
        <span className="flex-1 text-xs font-semibold text-purple-700">{data.label}</span>
        <button
          onClick={() => data.onEdit?.(id)}
          className="rounded p-0.5 text-purple-500 hover:bg-purple-100"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {preview || <span className="italic">No message set</span>}
        </p>
        <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
          Waiting for reply · {data.timeoutHours}h timeout
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400" />
    </div>
  );
}
```

- [ ] **Step 4: Create ConditionNode**

The condition node has TWO source handles — one labelled "Yes" at the bottom-left and one "No" at the bottom-right. The `id` of each handle is `'yes'` and `'no'` respectively; the flow engine uses these to pick which edge to follow.

```tsx
// modules/flows/components/nodes/ConditionNode.tsx
'use client';

import { Handle, Position, type NodeProps } from 'reactflow';
import { GitBranch, Pencil } from 'lucide-react';
import type { ConditionNodeData } from '../../types';

export function ConditionNode({ id, data }: NodeProps<ConditionNodeData>) {
  return (
    <div className="relative w-64 rounded-lg border border-amber-200 bg-white shadow-sm">
      <Handle type="target" position={Position.Top} className="!bg-amber-400" />
      <div className="flex items-center gap-2 rounded-t-lg border-b border-amber-100 bg-amber-50 px-3 py-2">
        <GitBranch className="h-3.5 w-3.5 text-amber-600" />
        <span className="flex-1 text-xs font-semibold text-amber-700">{data.label}</span>
        <button
          onClick={() => data.onEdit?.(id)}
          className="rounded p-0.5 text-amber-500 hover:bg-amber-100"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
      <div className="px-3 py-2 text-[11px] text-muted-foreground space-y-1">
        <p><span className="font-medium">Match:</span> {data.matchType}</p>
        <p><span className="font-medium">Keyword:</span> &quot;{data.keyword}&quot;</p>
      </div>
      {/* Bottom row labels */}
      <div className="flex justify-between px-3 pb-2 text-[10px] font-semibold">
        <span className="text-emerald-600">Yes</span>
        <span className="text-red-500">No</span>
      </div>
      {/* Yes handle — left side of bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{ left: '25%' }}
        className="!bg-emerald-500"
      />
      {/* No handle — right side of bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ left: '75%' }}
        className="!bg-red-400"
      />
    </div>
  );
}
```

- [ ] **Step 5: Create AssignAgentNode**

```tsx
// modules/flows/components/nodes/AssignAgentNode.tsx
'use client';

import { Handle, Position, type NodeProps } from 'reactflow';
import { UserCheck, Pencil } from 'lucide-react';
import type { AssignAgentNodeData } from '../../types';

export function AssignAgentNode({ id, data }: NodeProps<AssignAgentNodeData>) {
  const preview = data.message.length > 60
    ? data.message.slice(0, 60) + '…'
    : data.message;

  return (
    <div className="relative w-56 rounded-lg border border-red-200 bg-white shadow-sm">
      <Handle type="target" position={Position.Top} className="!bg-red-400" />
      <div className="flex items-center gap-2 rounded-t-lg border-b border-red-100 bg-red-50 px-3 py-2">
        <UserCheck className="h-3.5 w-3.5 text-red-600" />
        <span className="flex-1 text-xs font-semibold text-red-700">{data.label}</span>
        <button
          onClick={() => data.onEdit?.(id)}
          className="rounded p-0.5 text-red-500 hover:bg-red-100"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {preview || <span className="italic">No message set</span>}
        </p>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600">
          → Hands off to agent
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create EndNode**

```tsx
// modules/flows/components/nodes/EndNode.tsx
'use client';

import { Handle, Position, type NodeProps } from 'reactflow';
import { Square, Pencil } from 'lucide-react';
import type { EndNodeData } from '../../types';

export function EndNode({ id, data }: NodeProps<EndNodeData>) {
  const preview = data.message.length > 60
    ? data.message.slice(0, 60) + '…'
    : data.message;

  return (
    <div className="relative w-56 rounded-lg border border-gray-200 bg-white shadow-sm">
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <div className="flex items-center gap-2 rounded-t-lg border-b border-gray-100 bg-gray-50 px-3 py-2">
        <Square className="h-3.5 w-3.5 text-gray-500" />
        <span className="flex-1 text-xs font-semibold text-gray-600">{data.label}</span>
        <button
          onClick={() => data.onEdit?.(id)}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
      <div className="px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
        {preview || <span className="italic">No farewell message</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add modules/flows/components/nodes/
git commit -m "feat(flows): add 6 custom ReactFlow node components"
```

---

## Task 3: NodeConfigPanel

**Files:**
- Create: `modules/flows/components/NodeConfigPanel/index.tsx`

This is a fixed-right slide-in panel (`w-80`) that renders a different form depending on the selected node type. It calls `onSave(nodeId, newData)` on submit.

- [ ] **Step 1: Create NodeConfigPanel**

```tsx
// modules/flows/components/NodeConfigPanel/index.tsx
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FlowNode, FlowNodeData } from '../../types';

interface NodeConfigPanelProps {
  node: FlowNode | null;
  onSave: (nodeId: string, data: Partial<FlowNodeData>) => void;
  onClose: () => void;
}

export function NodeConfigPanel({ node, onSave, onClose }: NodeConfigPanelProps) {
  const [formData, setFormData] = useState<Record<string, string | number>>({});

  useEffect(() => {
    if (node) {
      const d = node.data as Record<string, string | number>;
      setFormData({ ...d });
    }
  }, [node?.id]);

  if (!node) return null;

  const handleSave = () => {
    onSave(node.id, formData as Partial<FlowNodeData>);
    onClose();
  };

  const set = (key: string, value: string | number) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-full w-80 flex-col border-l border-border bg-card shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Edit Node</h2>
        <button onClick={onClose} className="rounded p-1 hover:bg-accent">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Label field — common to all node types */}
        <div className="space-y-1.5">
          <Label className="text-xs">Node Label</Label>
          <Input
            value={String(formData.label ?? '')}
            onChange={(e) => set('label', e.target.value)}
            placeholder="Node label"
            className="h-8 text-sm"
          />
        </div>

        {/* start node */}
        {node.type === 'start' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Trigger Type</Label>
              <Select
                value={String(formData.triggerType ?? 'keyword')}
                onValueChange={(v) => set('triggerType', v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Keyword</SelectItem>
                  <SelectItem value="first_message">First Message</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.triggerType === 'keyword' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Trigger Keyword</Label>
                <Input
                  value={String(formData.triggerValue ?? '')}
                  onChange={(e) => set('triggerValue', e.target.value)}
                  placeholder="e.g. hello"
                  className="h-8 text-sm"
                />
              </div>
            )}
          </>
        )}

        {/* message node */}
        {node.type === 'message' && (
          <div className="space-y-1.5">
            <Label className="text-xs">Message Text</Label>
            <Textarea
              value={String(formData.message ?? '')}
              onChange={(e) => set('message', e.target.value)}
              placeholder="Message to send..."
              rows={4}
              className="text-sm resize-none"
            />
          </div>
        )}

        {/* question node */}
        {node.type === 'question' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Question Text</Label>
              <Textarea
                value={String(formData.message ?? '')}
                onChange={(e) => set('message', e.target.value)}
                placeholder="Question to ask..."
                rows={4}
                className="text-sm resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Timeout (hours)</Label>
              <Input
                type="number"
                min={1}
                max={72}
                value={String(formData.timeoutHours ?? 24)}
                onChange={(e) => set('timeoutHours', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
          </>
        )}

        {/* condition node */}
        {node.type === 'condition' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Match Type</Label>
              <Select
                value={String(formData.matchType ?? 'contains')}
                onValueChange={(v) => set('matchType', v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="equals">Equals</SelectItem>
                  <SelectItem value="starts_with">Starts with</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Keyword</Label>
              <Input
                value={String(formData.keyword ?? '')}
                onChange={(e) => set('keyword', e.target.value)}
                placeholder="e.g. yes"
                className="h-8 text-sm"
              />
            </div>
          </>
        )}

        {/* assign_agent node */}
        {node.type === 'assign_agent' && (
          <div className="space-y-1.5">
            <Label className="text-xs">Pre-handoff Message</Label>
            <Textarea
              value={String(formData.message ?? '')}
              onChange={(e) => set('message', e.target.value)}
              placeholder="Message sent before handoff..."
              rows={4}
              className="text-sm resize-none"
            />
          </div>
        )}

        {/* end node */}
        {node.type === 'end' && (
          <div className="space-y-1.5">
            <Label className="text-xs">Farewell Message (optional)</Label>
            <Textarea
              value={String(formData.message ?? '')}
              onChange={(e) => set('message', e.target.value)}
              placeholder="Optional closing message..."
              rows={4}
              className="text-sm resize-none"
            />
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-border px-4 py-3">
        <Button size="sm" variant="outline" onClick={onClose} className="flex-1 h-8 text-xs">
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} className="flex-1 h-8 text-xs">
          Save
        </Button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/flows/components/NodeConfigPanel/
git commit -m "feat(flows): add NodeConfigPanel slide-in edit form"
```

---

## Task 4: FlowCanvas

**Files:**
- Create: `modules/flows/components/FlowCanvas/index.tsx`

- [ ] **Step 1: Create FlowCanvas**

Note: `import 'reactflow/dist/style.css'` is required here. The parent must set the container to `h-full`.

```tsx
// modules/flows/components/FlowCanvas/index.tsx
'use client';

import 'reactflow/dist/style.css';
import ReactFlow, {
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from 'reactflow';
import { useMemo } from 'react';
import { StartNode } from '../nodes/StartNode';
import { MessageNode } from '../nodes/MessageNode';
import { QuestionNode } from '../nodes/QuestionNode';
import { ConditionNode } from '../nodes/ConditionNode';
import { AssignAgentNode } from '../nodes/AssignAgentNode';
import { EndNode } from '../nodes/EndNode';
import type { FlowNode, FlowEdge } from '../../types';

const NODE_TYPES = {
  start:        StartNode,
  message:      MessageNode,
  question:     QuestionNode,
  condition:    ConditionNode,
  assign_agent: AssignAgentNode,
  end:          EndNode,
} as const;

const DEFAULT_EDGE_OPTIONS = {
  animated: true,
  style: { stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '5 5' },
};

interface FlowCanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  onNodeEdit: (nodeId: string) => void;
  selectedNodeId: string | null;
}

export function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeEdit,
  selectedNodeId,
}: FlowCanvasProps) {
  // Inject onEdit callback into every node's data
  const nodesWithCallbacks = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
        data: { ...n.data, onEdit: onNodeEdit },
      })),
    [nodes, onNodeEdit, selectedNodeId],
  );

  return (
    <ReactFlow
      nodes={nodesWithCallbacks}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={NODE_TYPES}
      defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      deleteKeyCode="Delete"
      className="bg-accent/20"
    >
      <Controls />
      <MiniMap
        nodeColor={(n) => {
          const colors: Record<string, string> = {
            start:        '#22c55e',
            message:      '#3b82f6',
            question:     '#a855f7',
            condition:    '#f59e0b',
            assign_agent: '#ef4444',
            end:          '#6b7280',
          };
          return colors[n.type ?? ''] ?? '#94a3b8';
        }}
        maskColor="rgba(255,255,255,0.5)"
      />
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
    </ReactFlow>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/flows/components/FlowCanvas/
git commit -m "feat(flows): add FlowCanvas with ReactFlow and custom node types"
```

---

## Task 5: AddNodeToolbar

**Files:**
- Create: `modules/flows/components/AddNodeToolbar/index.tsx`

- [ ] **Step 1: Create AddNodeToolbar**

Each button calls `onAdd(type)`. The toolbar does not add Start nodes (one per flow). Positioning is `random` in the visible canvas area.

```tsx
// modules/flows/components/AddNodeToolbar/index.tsx
'use client';

import { MessageSquare, HelpCircle, GitBranch, UserCheck, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { FlowNodeType } from '../../types';

interface AddNodeToolbarProps {
  onAdd: (type: FlowNodeType) => void;
}

const ADDABLE_NODES: Array<{
  type: FlowNodeType;
  label: string;
  icon: React.ElementType;
  colorClass: string;
}> = [
  { type: 'message',      label: 'Message',  icon: MessageSquare, colorClass: 'text-blue-600 hover:bg-blue-50 border-blue-200' },
  { type: 'question',     label: 'Question', icon: HelpCircle,    colorClass: 'text-purple-600 hover:bg-purple-50 border-purple-200' },
  { type: 'condition',    label: 'Condition',icon: GitBranch,     colorClass: 'text-amber-600 hover:bg-amber-50 border-amber-200' },
  { type: 'assign_agent', label: 'Handoff',  icon: UserCheck,     colorClass: 'text-red-600 hover:bg-red-50 border-red-200' },
  { type: 'end',          label: 'End',      icon: Square,        colorClass: 'text-gray-600 hover:bg-gray-50 border-gray-200' },
];

export function AddNodeToolbar({ onAdd }: AddNodeToolbarProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-2 shadow-md">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Add Node
      </p>
      {ADDABLE_NODES.map(({ type, label, icon: Icon, colorClass }) => (
        <Tooltip key={type}>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAdd(type)}
              className={`h-8 w-full justify-start gap-2 border text-xs ${colorClass}`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>+ {label}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Add {label} node</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/flows/components/AddNodeToolbar/
git commit -m "feat(flows): add AddNodeToolbar for inserting flow nodes"
```

---

## Task 6: Flow Service and Hooks

**Files:**
- Create: `modules/flows/services/flow.service.ts`
- Create: `modules/flows/hooks/useFlows.ts`

- [ ] **Step 1: Create flow.service.ts**

```typescript
// modules/flows/services/flow.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/services/supabase/client';
import type { ChatbotFlow } from '../types';

export async function fetchFlows(workspaceId: string): Promise<ChatbotFlow[]> {
  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from('chatbot_flows')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChatbotFlow[];
}

export async function fetchFlow(id: string): Promise<ChatbotFlow> {
  const supabase = createClient() as any;
  const { data, error } = await supabase
    .from('chatbot_flows')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as ChatbotFlow;
}

export async function createFlow(name: string): Promise<ChatbotFlow> {
  const res = await fetch('/api/flows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json() as { flow?: ChatbotFlow; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to create flow');
  return data.flow!;
}

export async function updateFlow(
  id: string,
  payload: Partial<Pick<ChatbotFlow, 'name' | 'description' | 'is_active' | 'nodes' | 'edges'>>,
): Promise<ChatbotFlow> {
  const res = await fetch(`/api/flows/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json() as { flow?: ChatbotFlow; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to update flow');
  return data.flow!;
}

export async function deleteFlow(id: string): Promise<void> {
  const res = await fetch(`/api/flows/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? 'Failed to delete flow');
  }
}
```

- [ ] **Step 2: Create useFlows.ts**

```typescript
// modules/flows/hooks/useFlows.ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/store/workspace.store';
import {
  fetchFlows, fetchFlow, createFlow, updateFlow, deleteFlow,
} from '../services/flow.service';
import type { ChatbotFlow } from '../types';

export function useFlows() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useQuery({
    queryKey: ['flows', workspaceId],
    queryFn: () => fetchFlows(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useFlow(id: string) {
  return useQuery({
    queryKey: ['flows', id],
    queryFn: () => fetchFlow(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateFlow() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (name: string) => createFlow(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows', workspaceId] }),
  });
}

export function useUpdateFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<Pick<ChatbotFlow, 'name' | 'description' | 'is_active' | 'nodes' | 'edges'>>;
    }) => updateFlow(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['flows', id] });
    },
  });
}

export function useDeleteFlow() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (id: string) => deleteFlow(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows', workspaceId] }),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add modules/flows/services/ modules/flows/hooks/
git commit -m "feat(flows): add flow service and TanStack Query hooks"
```

---

## Task 7: API Routes

**Files:**
- Create: `app/api/flows/route.ts`
- Create: `app/api/flows/[id]/route.ts`

The POST for creating a flow inserts a default Start node so the canvas is never empty.

- [ ] **Step 1: Create app/api/flows/route.ts**

```typescript
// app/api/flows/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('chatbot_flows')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ flows: data ?? [] });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Flows GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: string; workspaceId?: string };
    const { name = 'New Flow', workspaceId: bodyWorkspaceId } = body;

    // workspaceId can come from body OR be resolved from auth
    // We resolve workspace from the auth context
    const supabase = createAdminClient();

    // Get workspace from auth — find the first workspace the user owns
    // The client sends workspaceId in the body for POST
    const workspaceId = bodyWorkspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const defaultStartNode = {
      id: 'start-1',
      type: 'start',
      position: { x: 250, y: 80 },
      data: {
        label: 'Start',
        triggerType: 'keyword',
        triggerValue: '',
      },
    };

    const { data, error } = await (supabase as any)
      .from('chatbot_flows')
      .insert({
        workspace_id: workspaceId,
        name,
        nodes: [defaultStartNode],
        edges: [],
        is_active: false,
        trigger_type: 'keyword',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ flow: data }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Flows POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create app/api/flows/[id]/route.ts**

```typescript
// app/api/flows/[id]/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

async function getFlowWorkspace(id: string): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from('chatbot_flows')
    .select('workspace_id')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error('Flow not found');
  return data.workspace_id as string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = await getFlowWorkspace(id);
    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('chatbot_flows')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ flow: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Flow GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = await getFlowWorkspace(id);
    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const body = await request.json() as Record<string, unknown>;
    const allowed = ['name', 'description', 'is_active', 'nodes', 'edges', 'trigger_type', 'trigger_value'];
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from('chatbot_flows')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ flow: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Flow PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = await getFlowWorkspace(id);
    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const supabase = createAdminClient();
    const { error } = await (supabase as any)
      .from('chatbot_flows')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Flow DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/flows/
git commit -m "feat(flows): add GET/POST/PATCH/DELETE API routes for chatbot flows"
```

---

## Task 8: Flow Builder Page

**Files:**
- Create: `app/(dashboard)/flows/[id]/page.tsx`

This is a full-screen `'use client'` page. It owns all ReactFlow state via `useNodesState` / `useEdgesState`. Saving calls `useUpdateFlow`. The top bar has: back arrow, editable flow name, active toggle, save button.

- [ ] **Step 1: Create the builder page**

```tsx
// app/(dashboard)/flows/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useNodesState, useEdgesState, addEdge, type Connection, type NodeChange, type EdgeChange } from 'reactflow';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { FlowCanvas } from '@/modules/flows/components/FlowCanvas';
import { AddNodeToolbar } from '@/modules/flows/components/AddNodeToolbar';
import { NodeConfigPanel } from '@/modules/flows/components/NodeConfigPanel';
import { useFlow, useUpdateFlow } from '@/modules/flows/hooks/useFlows';
import type { FlowNode, FlowEdge, FlowNodeType, FlowNodeData } from '@/modules/flows/types';

function makeDefaultData(type: FlowNodeType): FlowNodeData {
  switch (type) {
    case 'message':      return { label: 'Message', message: '' };
    case 'question':     return { label: 'Question', message: '', timeoutHours: 24 };
    case 'condition':    return { label: 'Condition', keyword: '', matchType: 'contains' };
    case 'assign_agent': return { label: 'Handoff to Agent', message: '' };
    case 'end':          return { label: 'End', message: '' };
    default:             return { label: 'Start', triggerType: 'keyword', triggerValue: '' };
  }
}

export default function FlowBuilderPage() {
  const params   = useParams<{ id: string }>();
  const router   = useRouter();
  const flowId   = params.id;

  const { data: flow, isLoading } = useFlow(flowId);
  const updateFlow = useUpdateFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [flowName, setFlowName]         = useState('');
  const [isActive, setIsActive]         = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving]         = useState(false);

  // Populate state once flow loads
  useEffect(() => {
    if (flow) {
      setNodes((flow.nodes ?? []) as FlowNode[]);
      setEdges((flow.edges ?? []) as FlowEdge[]);
      setFlowName(flow.name);
      setIsActive(flow.is_active);
    }
  }, [flow?.id]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, animated: true }, eds)),
    [setEdges],
  );

  const handleAddNode = useCallback(
    (type: FlowNodeType) => {
      const id = `${type}-${Date.now()}`;
      const newNode: FlowNode = {
        id,
        type,
        position: { x: 200 + Math.random() * 300, y: 200 + Math.random() * 200 },
        data: makeDefaultData(type),
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes],
  );

  const handleNodeEdit = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleConfigSave = useCallback(
    (nodeId: string, newData: Partial<FlowNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n,
        ),
      );
      setSelectedNodeId(null);
    },
    [setNodes],
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateFlow.mutateAsync({
        id: flowId,
        payload: { name: flowName, nodes: nodes as FlowNode[], edges: edges as FlowEdge[] },
      });
      toast.success('Flow saved');
    } catch {
      toast.error('Failed to save flow');
    } finally {
      setIsSaving(false);
    }
  };

  const handleActiveToggle = async (active: boolean) => {
    setIsActive(active);
    try {
      await updateFlow.mutateAsync({ id: flowId, payload: { is_active: active } });
      toast.success(active ? 'Flow activated' : 'Flow deactivated');
    } catch {
      toast.error('Failed to update flow status');
      setIsActive(!active);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/flows')}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <Input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="h-8 max-w-xs border-transparent bg-transparent text-sm font-semibold shadow-none focus-visible:border-border focus-visible:bg-background"
          />

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Active</span>
              <Switch checked={isActive} onCheckedChange={handleActiveToggle} />
            </div>
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        </header>

        {/* Canvas area */}
        <div className="relative flex flex-1 overflow-hidden">
          {/* Left toolbar */}
          <div className="absolute left-3 top-3 z-10">
            <AddNodeToolbar onAdd={handleAddNode} />
          </div>

          {/* ReactFlow Canvas — must fill remaining height */}
          <div className="flex-1 h-full">
            <FlowCanvas
              nodes={nodes as FlowNode[]}
              edges={edges as FlowEdge[]}
              onNodesChange={onNodesChange as (changes: NodeChange[]) => void}
              onEdgesChange={onEdgesChange as (changes: EdgeChange[]) => void}
              onConnect={onConnect}
              onNodeEdit={handleNodeEdit}
              selectedNodeId={selectedNodeId}
            />
          </div>

          {/* Config Panel */}
          {selectedNode && (
            <NodeConfigPanel
              node={selectedNode as FlowNode}
              onSave={handleConfigSave}
              onClose={() => setSelectedNodeId(null)}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/flows/[id]/page.tsx"
git commit -m "feat(flows): add full-screen flow builder page"
```

---

## Task 9: Flows List Page

**Files:**
- Create: `app/(dashboard)/flows/page.tsx`

- [ ] **Step 1: Create flows list page**

```tsx
// app/(dashboard)/flows/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useFlows, useCreateFlow, useUpdateFlow, useDeleteFlow } from '@/modules/flows/hooks/useFlows';
import { useWorkspaceStore } from '@/store/workspace.store';

export default function FlowsPage() {
  const router      = useRouter();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const { data: flows = [], isLoading } = useFlows();
  const createFlow  = useCreateFlow();
  const updateFlow  = useUpdateFlow();
  const deleteFlow  = useDeleteFlow();
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!workspaceId) return;
    setCreating(true);
    try {
      const flow = await createFlow.mutateAsync('New Flow');
      router.push(`/flows/${flow.id}`);
    } catch {
      toast.error('Failed to create flow');
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete flow "${name}"? This cannot be undone.`)) return;
    try {
      await deleteFlow.mutateAsync(id);
      toast.success('Flow deleted');
    } catch {
      toast.error('Failed to delete flow');
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await updateFlow.mutateAsync({ id, payload: { is_active: !current } });
    } catch {
      toast.error('Failed to update flow');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-base font-semibold text-foreground">Chatbot Flows</h1>
        </div>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          New Flow
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {flows.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <GitBranch className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No flows yet</p>
            <p className="text-xs text-muted-foreground">Create your first chatbot flow to automate conversations</p>
            <Button size="sm" className="mt-2 h-8 gap-1.5 text-xs" onClick={handleCreate} disabled={creating}>
              <Plus className="h-3.5 w-3.5" /> Create Flow
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Nodes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : flows.map((flow) => (
                    <TableRow key={flow.id} className="hover:bg-accent">
                      <TableCell className="font-medium text-sm">{flow.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">
                        {flow.trigger_type === 'keyword'
                          ? `Keyword: "${flow.trigger_value ?? ''}"`
                          : 'First message'}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          flow.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-500',
                        )}>
                          {flow.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(flow.nodes ?? []).length}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(flow.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={flow.is_active}
                            onCheckedChange={() => handleToggleActive(flow.id, flow.is_active)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => router.push(`/flows/${flow.id}`)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(flow.id, flow.name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/flows/page.tsx"
git commit -m "feat(flows): add flows list page with create/edit/delete/toggle"
```

---

## Task 10: Flow Execution Engine

**Files:**
- Create: `lib/flow-engine.ts`

This file runs entirely server-side (inside the webhook handler). It uses the admin client directly.

Key behaviors:
- Finds active `flow_session` for a conversation or finds a matching flow trigger
- Executes nodes sequentially, pausing at `question` nodes (saves state)
- Sends WhatsApp messages using the same pattern as `inbox-rules-engine.ts`
- Returns `true` if a flow handled the message (caller skips AI auto-reply)

- [ ] **Step 1: Create lib/flow-engine.ts**

```typescript
// lib/flow-engine.ts
import { createAdminClient } from '@/services/supabase/admin';
import type { FlowNode, FlowEdge, ChatbotFlow } from '@/modules/flows/types';

type AdminClient = ReturnType<typeof createAdminClient>;

// ──────────────────────────────────────────────────────────────
// WhatsApp send helper (same pattern as inbox-rules-engine.ts)
// ──────────────────────────────────────────────────────────────
async function sendWAMessage(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  body: string,
  workspaceId: string,
  conversationId: string,
  supabase: AdminClient,
): Promise<void> {
  if (!body.trim()) return;
  const db = supabase as any;

  let waMessageId: string | null = null;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.replace(/﻿/g, '').trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'text',
          text: { preview_url: false, body },
        }),
      },
    );

    if (res.ok) {
      const data = await res.json() as { messages?: Array<{ id?: string }> };
      waMessageId = data?.messages?.[0]?.id ?? null;
    } else {
      console.error('[FlowEngine] WhatsApp API error:', await res.text());
    }
  } catch (err) {
    console.error('[FlowEngine] sendWAMessage failed:', err);
  }

  const now = new Date().toISOString();

  await db.from('messages').insert({
    conversation_id: conversationId,
    workspace_id:    workspaceId,
    sender_type:     'bot',
    sender_id:       null,
    direction:       'outbound',
    type:            'text',
    content:         body,
    status:          'sent',
    whatsapp_msg_id: waMessageId,
    created_at:      now,
  });

  await db
    .from('conversations')
    .update({ last_message: body, last_message_at: now })
    .eq('id', conversationId);
}

// ──────────────────────────────────────────────────────────────
// Edge navigation helpers
// ──────────────────────────────────────────────────────────────
function getNextNodeId(
  edges: FlowEdge[],
  fromNodeId: string,
  handleId?: string,
): string | null {
  const edge = edges.find(
    (e) =>
      e.source === fromNodeId &&
      (handleId == null || e.sourceHandle === handleId),
  );
  return edge?.target ?? null;
}

function getNodeById(nodes: FlowNode[], id: string): FlowNode | undefined {
  return nodes.find((n) => n.id === id);
}

// ──────────────────────────────────────────────────────────────
// Trigger matching
// ──────────────────────────────────────────────────────────────
function matchesTrigger(
  flow: ChatbotFlow,
  messageContent: string,
  isFirstMessage: boolean,
): boolean {
  if (flow.trigger_type === 'first_message') return isFirstMessage;
  if (flow.trigger_type === 'keyword') {
    const kw = (flow.trigger_value ?? '').toLowerCase().trim();
    if (!kw) return false;
    return messageContent.toLowerCase().includes(kw);
  }
  return false;
}

// ──────────────────────────────────────────────────────────────
// Condition evaluation
// ──────────────────────────────────────────────────────────────
function evaluateCondition(
  data: { keyword: string; matchType: 'contains' | 'equals' | 'starts_with' },
  userReply: string,
): boolean {
  const reply = userReply.toLowerCase().trim();
  const kw    = data.keyword.toLowerCase().trim();
  switch (data.matchType) {
    case 'contains':    return reply.includes(kw);
    case 'equals':      return reply === kw;
    case 'starts_with': return reply.startsWith(kw);
    default:            return false;
  }
}

// ──────────────────────────────────────────────────────────────
// Session helpers
// ──────────────────────────────────────────────────────────────
async function getActiveSession(supabase: AdminClient, conversationId: string) {
  const { data } = await (supabase as any)
    .from('flow_sessions')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function upsertSession(
  supabase: AdminClient,
  sessionId: string | null,
  flowId: string,
  workspaceId: string,
  conversationId: string,
  contactId: string,
  currentNodeId: string,
  status: 'active' | 'completed',
): Promise<void> {
  const db = supabase as any;
  const now = new Date().toISOString();

  if (sessionId) {
    await db
      .from('flow_sessions')
      .update({ current_node_id: currentNodeId, status, updated_at: now })
      .eq('id', sessionId);
  } else {
    await db.from('flow_sessions').insert({
      flow_id:         flowId,
      workspace_id:    workspaceId,
      conversation_id: conversationId,
      contact_id:      contactId,
      current_node_id: currentNodeId,
      status,
      started_at:      now,
      updated_at:      now,
    });
  }
}

// ──────────────────────────────────────────────────────────────
// Main execution loop for a single flow run
// ──────────────────────────────────────────────────────────────
async function executeFlow(
  supabase: AdminClient,
  flow: ChatbotFlow,
  startNodeId: string,
  sessionId: string | null,
  userReply: string,
  workspaceId: string,
  conversationId: string,
  contactId: string,
  phoneNumberId: string,
  accessToken: string,
  contactPhone: string,
): Promise<boolean> {
  const nodes = (flow.nodes ?? []) as FlowNode[];
  const edges = (flow.edges ?? []) as FlowEdge[];
  let currentNodeId: string | null = startNodeId;

  while (currentNodeId) {
    const node = getNodeById(nodes, currentNodeId);
    if (!node) {
      console.warn(`[FlowEngine] Node ${currentNodeId} not found in flow ${flow.id}`);
      break;
    }

    console.log(`[FlowEngine] Executing node ${node.id} (${node.type})`);

    switch (node.type) {
      case 'start': {
        // Just advance past the start node
        currentNodeId = getNextNodeId(edges, node.id);
        break;
      }

      case 'message': {
        const msg = (node.data as { message: string }).message ?? '';
        await sendWAMessage(phoneNumberId, accessToken, contactPhone, msg, workspaceId, conversationId, supabase);
        currentNodeId = getNextNodeId(edges, node.id);
        break;
      }

      case 'question': {
        const msg = (node.data as { message: string }).message ?? '';
        await sendWAMessage(phoneNumberId, accessToken, contactPhone, msg, workspaceId, conversationId, supabase);
        // Pause here — save current node and wait for next inbound message
        await upsertSession(supabase, sessionId, flow.id, workspaceId, conversationId, contactId, node.id, 'active');
        return true;
      }

      case 'condition': {
        const condData = node.data as { keyword: string; matchType: 'contains' | 'equals' | 'starts_with' };
        const matched  = evaluateCondition(condData, userReply);
        const handleId = matched ? 'yes' : 'no';
        currentNodeId  = getNextNodeId(edges, node.id, handleId);
        break;
      }

      case 'assign_agent': {
        const msg = (node.data as { message: string }).message ?? '';
        if (msg) {
          await sendWAMessage(phoneNumberId, accessToken, contactPhone, msg, workspaceId, conversationId, supabase);
        }
        // Set conversation to pending
        await (supabase as any)
          .from('conversations')
          .update({ status: 'pending' })
          .eq('id', conversationId);

        await upsertSession(supabase, sessionId, flow.id, workspaceId, conversationId, contactId, node.id, 'completed');
        return true;
      }

      case 'end': {
        const msg = (node.data as { message: string }).message ?? '';
        if (msg) {
          await sendWAMessage(phoneNumberId, accessToken, contactPhone, msg, workspaceId, conversationId, supabase);
        }
        await upsertSession(supabase, sessionId, flow.id, workspaceId, conversationId, contactId, node.id, 'completed');
        return true;
      }

      default:
        console.warn(`[FlowEngine] Unknown node type: ${node.type}`);
        currentNodeId = null;
    }
  }

  // Reached end of graph without an explicit end node
  if (sessionId) {
    await (supabase as any)
      .from('flow_sessions')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', sessionId);
  }

  return true;
}

// ──────────────────────────────────────────────────────────────
// Public entry point — called from webhook handler
// ──────────────────────────────────────────────────────────────
export async function processFlowForMessage(
  supabase: AdminClient,
  workspaceId: string,
  conversationId: string,
  contactId: string,
  messageContent: string,
  phoneNumberId: string,
  accessToken: string,
  contactPhone: string,
  isFirstMessage: boolean,
): Promise<boolean> {
  const db = supabase as any;

  try {
    // 1. Check for active session
    const session = await getActiveSession(supabase, conversationId);

    if (session) {
      // Resume existing flow
      const { data: flow, error } = await db
        .from('chatbot_flows')
        .select('*')
        .eq('id', session.flow_id)
        .single();

      if (error || !flow) {
        console.error('[FlowEngine] Active session references missing flow', session.flow_id);
        return false;
      }

      const typedFlow = flow as ChatbotFlow;
      const nodes = (typedFlow.nodes ?? []) as FlowNode[];
      const edges = (typedFlow.edges ?? []) as FlowEdge[];

      // The session is paused at a question node — find the next node
      const pausedNode = nodes.find((n) => n.id === session.current_node_id);
      if (!pausedNode) return false;

      let nextNodeId: string | null = null;

      if (pausedNode.type === 'question') {
        // User replied — advance past this question
        nextNodeId = getNextNodeId(edges, pausedNode.id);
      }

      if (!nextNodeId) return false;

      return await executeFlow(
        supabase,
        typedFlow,
        nextNodeId,
        session.id as string,
        messageContent,
        workspaceId,
        conversationId,
        contactId,
        phoneNumberId,
        accessToken,
        contactPhone,
      );
    }

    // 2. No active session — find a matching flow trigger
    const { data: flows, error: flowsError } = await db
      .from('chatbot_flows')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true);

    if (flowsError || !flows || flows.length === 0) return false;

    for (const flow of flows as ChatbotFlow[]) {
      if (!matchesTrigger(flow, messageContent, isFirstMessage)) continue;

      // Find start node
      const nodes = (flow.nodes ?? []) as FlowNode[];
      const startNode = nodes.find((n) => n.type === 'start');
      if (!startNode) continue;

      console.log(`[FlowEngine] Flow "${flow.name}" matched — executing`);
      return await executeFlow(
        supabase,
        flow,
        startNode.id,
        null,
        messageContent,
        workspaceId,
        conversationId,
        contactId,
        phoneNumberId,
        accessToken,
        contactPhone,
      );
    }

    return false;
  } catch (err) {
    console.error('[FlowEngine] Unhandled error:', err);
    return false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/flow-engine.ts
git commit -m "feat(flows): add flow execution engine"
```

---

## Task 11: Webhook Integration

**Files:**
- Modify: `app/api/webhooks/whatsapp/route.ts`

Add the flow engine call inside `handleIncomingMessage`, after the `applyInboxRules` block and before `sendAutoReply`. If `processFlowForMessage` returns `true`, skip the AI auto-reply entirely.

- [ ] **Step 1: Add import at top of webhook route**

At the top of `app/api/webhooks/whatsapp/route.ts`, after the existing imports, add:

```typescript
import { processFlowForMessage } from '@/lib/flow-engine';
```

- [ ] **Step 2: Add flow engine call in handleIncomingMessage**

Find this block in `handleIncomingMessage` (around line 286–313):

```typescript
  if (wsForRules?.phone_number_id && wsForRules?.access_token) {
    await applyInboxRules(
      supabase,
      workspaceId,
      content,
      conversation.id,
      contact.id,
      isFirstMessage,
      wsForRules.phone_number_id,
      wsForRules.access_token,
    );
  }

  // Escalation detection — check BEFORE calling AI auto-reply
  const isEscalation = checkEscalationKeywords(content);
```

Replace it with:

```typescript
  if (wsForRules?.phone_number_id && wsForRules?.access_token) {
    await applyInboxRules(
      supabase,
      workspaceId,
      content,
      conversation.id,
      contact.id,
      isFirstMessage,
      wsForRules.phone_number_id,
      wsForRules.access_token,
    );
  }

  // Flow engine — if a chatbot flow handles this message, skip AI auto-reply
  if (wsForRules?.phone_number_id && wsForRules?.access_token) {
    const flowHandled = await processFlowForMessage(
      supabase,
      workspaceId,
      conversation.id,
      contact.id,
      content,
      wsForRules.phone_number_id,
      wsForRules.access_token,
      waId,
      isFirstMessage,
    );
    if (flowHandled) {
      console.log(`[Webhook] Flow handled message for conversation ${conversation.id}`);
      return;
    }
  }

  // Escalation detection — check BEFORE calling AI auto-reply
  const isEscalation = checkEscalationKeywords(content);
```

- [ ] **Step 3: Commit**

```bash
git add app/api/webhooks/whatsapp/route.ts
git commit -m "feat(flows): integrate flow engine into webhook handler"
```

---

## Task 12: Sidebar Navigation

**Files:**
- Modify: `components/layout/Sidebar/index.tsx`

- [ ] **Step 1: Add GitBranch to imports and Flows to NAV_ITEMS**

In `components/layout/Sidebar/index.tsx`, find:

```typescript
import {
  MessageSquare, Users, Kanban, Megaphone, FileText,
  BarChart3, Settings, UserCircle, ChevronLeft, ChevronRight,
  Users2,
} from 'lucide-react';
```

Replace with:

```typescript
import {
  MessageSquare, Users, Kanban, Megaphone, FileText,
  BarChart3, Settings, UserCircle, ChevronLeft, ChevronRight,
  Users2, GitBranch,
} from 'lucide-react';
```

Then find the `NAV_ITEMS` array:

```typescript
const NAV_ITEMS: Array<{ href: string; icon: LucideIcon; label: string }> = [
  { href: '/conversations', icon: MessageSquare, label: 'Conversations' },
  { href: '/contacts',      icon: Users,         label: 'Contacts'      },
  { href: '/crm',           icon: Kanban,        label: 'CRM Pipeline'  },
  { href: '/campaigns',     icon: Megaphone,     label: 'Campaigns'     },
  { href: '/templates',     icon: FileText,      label: 'Templates'     },
  { href: '/team',          icon: Users2,        label: 'Team'          },
  { href: '/analytics',     icon: BarChart3,     label: 'Analytics'     },
];
```

Replace with:

```typescript
const NAV_ITEMS: Array<{ href: string; icon: LucideIcon; label: string }> = [
  { href: '/conversations', icon: MessageSquare, label: 'Conversations' },
  { href: '/contacts',      icon: Users,         label: 'Contacts'      },
  { href: '/crm',           icon: Kanban,        label: 'CRM Pipeline'  },
  { href: '/campaigns',     icon: Megaphone,     label: 'Campaigns'     },
  { href: '/templates',     icon: FileText,      label: 'Templates'     },
  { href: '/flows',         icon: GitBranch,     label: 'Flows'         },
  { href: '/team',          icon: Users2,        label: 'Team'          },
  { href: '/analytics',     icon: BarChart3,     label: 'Analytics'     },
];
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/Sidebar/index.tsx
git commit -m "feat(flows): add Flows nav item to sidebar"
```

---

## Task 13: createFlow service fix — pass workspaceId

The `createFlow` service in `modules/flows/services/flow.service.ts` needs to include the workspaceId in the POST body (the API expects it). The hook gets the workspaceId from `useWorkspaceStore`.

- [ ] **Step 1: Update createFlow in flow.service.ts**

In `modules/flows/services/flow.service.ts`, replace:

```typescript
export async function createFlow(name: string): Promise<ChatbotFlow> {
  const res = await fetch('/api/flows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json() as { flow?: ChatbotFlow; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to create flow');
  return data.flow!;
}
```

With:

```typescript
export async function createFlow(name: string, workspaceId: string): Promise<ChatbotFlow> {
  const res = await fetch('/api/flows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, workspaceId }),
  });
  const data = await res.json() as { flow?: ChatbotFlow; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to create flow');
  return data.flow!;
}
```

- [ ] **Step 2: Update useCreateFlow in useFlows.ts**

In `modules/flows/hooks/useFlows.ts`, replace:

```typescript
export function useCreateFlow() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (name: string) => createFlow(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows', workspaceId] }),
  });
}
```

With:

```typescript
export function useCreateFlow() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  return useMutation({
    mutationFn: (name: string) => createFlow(name, workspaceId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows', workspaceId] }),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add modules/flows/services/flow.service.ts modules/flows/hooks/useFlows.ts
git commit -m "fix(flows): pass workspaceId when creating flow"
```

---

## Task 14: TypeScript Check

- [ ] **Step 1: Run TypeScript compiler**

```bash
npx tsc --noEmit
```

Expected: zero errors. If errors appear, address them before proceeding. Common issues to watch for:

- `FlowNodeData` type narrowing: use `node.type === 'message'` guards when accessing node-specific fields
- `useNodesState` / `useEdgesState` generic parameter — use `FlowNodeData` not `unknown`
- `NodeChange` / `EdgeChange` imports from `reactflow` — make sure they match what `onNodesChange` / `onEdgesChange` expect
- The `(supabase as any)` cast is intentional throughout — not an error

- [ ] **Step 2: Fix any TypeScript errors found**

Common patterns for fixes:

If you see: `Type 'FlowNode[]' is not assignable to type 'Node<unknown>[]'`
Fix: Cast `nodes as Node<FlowNodeData>[]` or adjust generics.

If you see: `Object is possibly 'undefined'` in engine:
Fix: add null check before using the value.

- [ ] **Step 3: Final commit after TypeScript passes**

```bash
git add -A
git commit -m "fix(flows): TypeScript clean-up — all types pass noEmit check"
```

---

## Self-Review Against Spec

| Spec Requirement | Task |
|---|---|
| `modules/flows/types/index.ts` — all 6 node data types | Task 1 |
| 6 custom node components with Handle, icon, edit button | Task 2 |
| NodeConfigPanel — form per node type, save/cancel | Task 3 |
| FlowCanvas — ReactFlow with nodeTypes map, Controls, MiniMap, Background | Task 4 |
| AddNodeToolbar — 5 addable node buttons | Task 5 |
| `useFlows`, `useFlow`, `useCreateFlow`, `useUpdateFlow`, `useDeleteFlow` | Task 6 |
| `app/api/flows/route.ts` — GET + POST | Task 7 |
| `app/api/flows/[id]/route.ts` — GET + PATCH + DELETE | Task 7 |
| Flow Builder page — top bar, canvas, config panel | Task 8 |
| Flows List page — table with name/trigger/status/nodes/date | Task 9 |
| `lib/flow-engine.ts` — processFlowForMessage | Task 10 |
| Webhook integration — call engine, skip AI if handled | Task 11 |
| Sidebar Flows nav item with GitBranch icon | Task 12 |
| workspaceId passed in POST body | Task 13 |
| `npx tsc --noEmit` passes | Task 14 |
| ReactFlow CSS import in FlowCanvas | Task 4 (step 1 — import included) |
| `import 'reactflow/dist/style.css'` | Task 4 |
| `h-full` container for ReactFlow | Task 8 (canvas div has `h-full`) |
| ConditionNode has yes/no handles with distinct sourceHandle ids | Task 2 step 4 |
| Flow engine: auto-advance non-blocking nodes | Task 10 (while loop) |
| Flow engine: pause at question, save session | Task 10 (question case) |
| Flow engine: condition follows yes/no edge by handle id | Task 10 (condition case) |
| assign_agent: set conversation status=pending | Task 10 (assign_agent case) |
| `requireWorkspacePermission('manage_templates')` on all API routes | Task 7 |
