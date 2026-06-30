# VMS Demo Booking — Employee Count Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add numeric variable saving + comparison to the flow builder engine and UI, then rebuild the VMS "Demo Booking Flow" so it qualifies leads on employee count (≥10) before scheduling a demo.

**Architecture:** `flow_sessions.context` (an existing, currently-unused JSONB column) becomes the storage for named numeric variables captured from Question node replies. Condition nodes gain a `variable_compare` mode that reads a named variable from that context and compares it numerically, alongside the existing `keyword` mode (default, unchanged) which keeps all other live flows working untouched. The VMS flow's `nodes`/`edges` JSON is then rebuilt to use the new condition type.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (Postgres + JSONB), React Flow (`reactflow`), Vitest.

## Global Constraints

- `conditionType` on `ConditionNodeData` defaults to `'keyword'` when absent — every existing flow's JSON has no `conditionType` field, so the keyword code path must stay byte-for-byte equivalent to current behavior when the field is missing.
- WhatsApp message formatting uses single-asterisk `*bold*`, not markdown `**bold**`.
- No `@testing-library/react` is installed in this project — UI task verification is manual (dev server + browser), not automated component tests.
- Test runner is Vitest (`npm test` → `vitest run`); existing convention is `tests/<name>.test.ts` importing from `../lib/...` or `../modules/...` (see `tests/env.test.ts`).
- VMS workspace id: `8a196458-5c09-4403-83e4-23505d0084d7`. Target flow id: `8f4f5254-e373-4c3c-b290-9d5903abeb1f` (`chatbot_flows.name = 'Demo Booking Flow'`, `trigger_value = 'demo'`).
- `.env.local` holds `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — never hardcode these values in committed files; scripts must read them from `.env.local` at runtime (existing scripts in `scripts/` that hardcode a DB password are a pre-existing anti-pattern — do not replicate it).

---

### Task 1: Extend flow node types for variables and numeric conditions

**Files:**
- Modify: `modules/flows/types/index.ts`

**Interfaces:**
- Produces: `ComparisonOperator` type; `QuestionNodeData.saveAsVariable?: string`; `ConditionNodeData.conditionType?: 'keyword' | 'variable_compare'`, `ConditionNodeData.variable?: string`, `ConditionNodeData.operator?: ComparisonOperator`, `ConditionNodeData.value?: number`.

- [ ] **Step 1: Edit the type definitions**

Replace the full contents of `modules/flows/types/index.ts` with:

```ts
import type { Node, Edge } from 'reactflow';

export type FlowNodeType = 'start' | 'message' | 'question' | 'condition' | 'assign_agent' | 'end';
export type ComparisonOperator = '>=' | '>' | '<' | '<=' | '==' | '!=';

export interface StartNodeData    { label: string; triggerType: 'keyword' | 'first_message'; triggerValue: string; }
export interface MessageNodeData  { label: string; message: string; }
export interface QuestionNodeData { label: string; message: string; timeoutHours: number; saveAsVariable?: string; }
export interface ConditionNodeData {
  label: string;
  conditionType?: 'keyword' | 'variable_compare';
  keyword: string;
  matchType: 'contains' | 'equals' | 'starts_with';
  variable?: string;
  operator?: ComparisonOperator;
  value?: number;
}
export interface AssignAgentNodeData { label: string; message: string; }
export interface EndNodeData      { label: string; message: string; }

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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (any pre-existing errors unrelated to `modules/flows` or `lib/flow-engine.ts` are out of scope — note them but don't fix them here).

- [ ] **Step 3: Commit**

```bash
git add modules/flows/types/index.ts
git commit -m "feat(flows): add variable + numeric comparison fields to node types"
```

---

### Task 2: Engine numeric helpers (parse, compare, evaluate) — TDD

**Files:**
- Create: `tests/flow-engine.test.ts`
- Modify: `lib/flow-engine.ts:116-129` (area right after `matchesCondition`)

**Interfaces:**
- Consumes: `ConditionNodeData` from `modules/flows/types` (Task 1).
- Produces: exported functions `parseNumberFromReply(reply: string): number`, `compareNumeric(value: number, operator: ComparisonOperator, threshold: number): boolean`, `evaluateCondition(data: ConditionNodeData, incomingMessage: string, context: Record<string, number>): boolean` from `lib/flow-engine.ts`.

- [ ] **Step 1: Write the failing test file**

Create `tests/flow-engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseNumberFromReply, compareNumeric, evaluateCondition } from '../lib/flow-engine';
import type { ConditionNodeData } from '../modules/flows/types';

describe('parseNumberFromReply', () => {
  it('parses a clean integer', () => {
    expect(parseNumberFromReply('12')).toBe(12);
  });

  it('extracts the first number from text', () => {
    expect(parseNumberFromReply('around 15 log hain')).toBe(15);
    expect(parseNumberFromReply('8-10 employees')).toBe(8);
  });

  it('returns 0 when no digits are present', () => {
    expect(parseNumberFromReply('bahut log hain')).toBe(0);
  });
});

describe('compareNumeric', () => {
  it('evaluates >= correctly', () => {
    expect(compareNumeric(10, '>=', 10)).toBe(true);
    expect(compareNumeric(9, '>=', 10)).toBe(false);
  });

  it('evaluates > correctly', () => {
    expect(compareNumeric(11, '>', 10)).toBe(true);
    expect(compareNumeric(10, '>', 10)).toBe(false);
  });

  it('evaluates < correctly', () => {
    expect(compareNumeric(5, '<', 10)).toBe(true);
    expect(compareNumeric(10, '<', 10)).toBe(false);
  });

  it('evaluates <= correctly', () => {
    expect(compareNumeric(10, '<=', 10)).toBe(true);
    expect(compareNumeric(11, '<=', 10)).toBe(false);
  });

  it('evaluates == correctly', () => {
    expect(compareNumeric(10, '==', 10)).toBe(true);
    expect(compareNumeric(9, '==', 10)).toBe(false);
  });

  it('evaluates != correctly', () => {
    expect(compareNumeric(9, '!=', 10)).toBe(true);
    expect(compareNumeric(10, '!=', 10)).toBe(false);
  });
});

describe('evaluateCondition', () => {
  const baseData: ConditionNodeData = { label: 'x', keyword: 'yes', matchType: 'contains' };

  it('falls back to keyword matching when conditionType is not set', () => {
    expect(evaluateCondition(baseData, 'Yes please', {})).toBe(true);
    expect(evaluateCondition(baseData, 'no thanks', {})).toBe(false);
  });

  it('compares a saved variable when conditionType is variable_compare', () => {
    const data: ConditionNodeData = {
      ...baseData,
      conditionType: 'variable_compare',
      variable: 'employee_count',
      operator: '>=',
      value: 10,
    };
    expect(evaluateCondition(data, 'irrelevant reply', { employee_count: 12 })).toBe(true);
    expect(evaluateCondition(data, 'irrelevant reply', { employee_count: 5 })).toBe(false);
  });

  it('treats a missing variable as 0', () => {
    const data: ConditionNodeData = {
      ...baseData,
      conditionType: 'variable_compare',
      variable: 'employee_count',
      operator: '>=',
      value: 10,
    };
    expect(evaluateCondition(data, 'irrelevant reply', {})).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/flow-engine.test.ts`
Expected: FAIL — `parseNumberFromReply`, `compareNumeric`, `evaluateCondition` are not exported from `lib/flow-engine.ts` (import error).

- [ ] **Step 3: Add the helpers**

In `lib/flow-engine.ts`, change the import on line 2 from:

```ts
import type { FlowNode, FlowEdge, ChatbotFlow } from '@/modules/flows/types';
```

to:

```ts
import type {
  FlowNode, FlowEdge, ChatbotFlow,
  QuestionNodeData, ConditionNodeData, ComparisonOperator,
} from '@/modules/flows/types';
```

Then insert these three exported functions immediately after the existing `matchesCondition` function (after line 129, before `async function executeNode`):

```ts
export function parseNumberFromReply(reply: string): number {
  const match = reply.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

export function compareNumeric(value: number, operator: ComparisonOperator, threshold: number): boolean {
  switch (operator) {
    case '>=': return value >= threshold;
    case '>':  return value > threshold;
    case '<':  return value < threshold;
    case '<=': return value <= threshold;
    case '==': return value === threshold;
    case '!=': return value !== threshold;
    default:   return false;
  }
}

export function evaluateCondition(
  data: ConditionNodeData,
  incomingMessage: string,
  context: Record<string, number>,
): boolean {
  if (data.conditionType === 'variable_compare') {
    const variableName = data.variable ?? '';
    const value = context[variableName] ?? 0;
    return compareNumeric(value, data.operator ?? '>=', data.value ?? 0);
  }
  return matchesCondition(incomingMessage, data.keyword, data.matchType);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/flow-engine.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/flow-engine.ts tests/flow-engine.test.ts
git commit -m "feat(flows): add numeric variable comparison helpers to flow engine"
```

---

### Task 3: Wire variable saving + numeric conditions into flow execution

**Files:**
- Modify: `lib/flow-engine.ts:131-393` (`executeNode` and `processFlowForMessage`)

**Interfaces:**
- Consumes: `parseNumberFromReply`, `evaluateCondition` (Task 2); `QuestionNodeData`, `ConditionNodeData` (Task 1).
- Produces: `executeNode` now takes a 12th parameter `context: Record<string, number>`; `flow_sessions.context` is read/written during question replies.

- [ ] **Step 1: Add the `context` parameter to `executeNode` and use it for conditions**

In `lib/flow-engine.ts`, change the `executeNode` function signature (originally lines 131-143) to add a final parameter:

```ts
async function executeNode(
  supabase: AdminClient,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
  workspaceId: string,
  conversationId: string,
  sessionId: string,
  incomingMessage: string,
  phoneNumberId: string,
  accessToken: string,
  contactPhone: string,
  context: Record<string, number>,
): Promise<boolean> {
```

Update the three recursive calls inside `executeNode` to pass `context` as the new final argument — in the `'start'` case (originally lines 156-159), the `'message'` case (originally lines 174-177), and the `'condition'` case (originally lines 208-211). Each recursive call changes from:

```ts
      return executeNode(
        supabase, next, nodes, edges, workspaceId, conversationId,
        sessionId, incomingMessage, phoneNumberId, accessToken, contactPhone,
      );
```

to:

```ts
      return executeNode(
        supabase, next, nodes, edges, workspaceId, conversationId,
        sessionId, incomingMessage, phoneNumberId, accessToken, contactPhone, context,
      );
```

Then replace the body of the `'condition'` case (originally lines 198-212) with:

```ts
    case 'condition': {
      const d = node.data as ConditionNodeData;
      const handleId = evaluateCondition(d, incomingMessage, context) ? 'yes' : 'no';
      const next = findNextNode(nodes, edges, node.id, handleId);
      if (!next) {
        await endSession(supabase, sessionId);
        return false;
      }
      await updateSession(supabase, sessionId, next.id);
      return executeNode(
        supabase, next, nodes, edges, workspaceId, conversationId,
        sessionId, incomingMessage, phoneNumberId, accessToken, contactPhone, context,
      );
    }
```

- [ ] **Step 2: Save the reply as a variable when a question node is answered, and thread context through `processFlowForMessage`**

In `lib/flow-engine.ts`, inside `processFlowForMessage`, replace the entire reply-handling block (originally lines 289-318):

```ts
      // For question/condition nodes waiting for reply: advance
      if (currentNode.type === 'question') {
        const next = findNextNode(nodes, edges, currentNodeId);
        if (!next) {
          await endSession(supabase, session.id as string);
          return false;
        }
        await updateSession(supabase, session.id as string, next.id);
        await executeNode(
          supabase, next, nodes, edges, workspaceId, conversationId,
          session.id as string, messageContent, phoneNumberId, accessToken, contactPhone,
        );
      } else if (currentNode.type === 'condition') {
        await executeNode(
          supabase, currentNode, nodes, edges, workspaceId, conversationId,
          session.id as string, messageContent, phoneNumberId, accessToken, contactPhone,
        );
      } else {
        // Shouldn't be waiting on other node types, just advance
        const next = findNextNode(nodes, edges, currentNodeId);
        if (next) {
          await updateSession(supabase, session.id as string, next.id);
          await executeNode(
            supabase, next, nodes, edges, workspaceId, conversationId,
            session.id as string, messageContent, phoneNumberId, accessToken, contactPhone,
          );
        } else {
          await endSession(supabase, session.id as string);
        }
      }
```

with:

```ts
      // For question/condition nodes waiting for reply: advance
      if (currentNode.type === 'question') {
        const qData = currentNode.data as QuestionNodeData;
        let context = (session.context as Record<string, number>) ?? {};
        if (qData.saveAsVariable) {
          context = { ...context, [qData.saveAsVariable]: parseNumberFromReply(messageContent) };
          await (supabase as any).from('flow_sessions').update({ context }).eq('id', session.id);
        }
        const next = findNextNode(nodes, edges, currentNodeId);
        if (!next) {
          await endSession(supabase, session.id as string);
          return false;
        }
        await updateSession(supabase, session.id as string, next.id);
        await executeNode(
          supabase, next, nodes, edges, workspaceId, conversationId,
          session.id as string, messageContent, phoneNumberId, accessToken, contactPhone, context,
        );
      } else if (currentNode.type === 'condition') {
        const context = (session.context as Record<string, number>) ?? {};
        await executeNode(
          supabase, currentNode, nodes, edges, workspaceId, conversationId,
          session.id as string, messageContent, phoneNumberId, accessToken, contactPhone, context,
        );
      } else {
        // Shouldn't be waiting on other node types, just advance
        const context = (session.context as Record<string, number>) ?? {};
        const next = findNextNode(nodes, edges, currentNodeId);
        if (next) {
          await updateSession(supabase, session.id as string, next.id);
          await executeNode(
            supabase, next, nodes, edges, workspaceId, conversationId,
            session.id as string, messageContent, phoneNumberId, accessToken, contactPhone, context,
          );
        } else {
          await endSession(supabase, session.id as string);
        }
      }
```

Finally, update the initial start-node execution call near the end of `processFlowForMessage` (originally lines 383-386) from:

```ts
    await executeNode(
      supabase, startNode, nodes, edges, workspaceId, conversationId,
      newSession.id as string, messageContent, phoneNumberId, accessToken, contactPhone,
    );
```

to:

```ts
    await executeNode(
      supabase, startNode, nodes, edges, workspaceId, conversationId,
      newSession.id as string, messageContent, phoneNumberId, accessToken, contactPhone, {},
    );
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: PASS — `tests/env.test.ts` and `tests/flow-engine.test.ts` both green.

- [ ] **Step 5: Manual code review checklist**

There is no integration test harness for `processFlowForMessage` (it requires a live Supabase session + WhatsApp webhook). Before committing, re-read the diff and confirm:
- Every call site of `executeNode` now passes a `context` argument (search for `executeNode(` in the file — there should be exactly 7 call sites, all with `context` or `{}` as the last argument).
- The `condition` case in `executeNode` no longer references the old inline `{ keyword, matchType }` type — it uses `ConditionNodeData`.

- [ ] **Step 6: Commit**

```bash
git add lib/flow-engine.ts
git commit -m "feat(flows): persist question replies as session variables and evaluate numeric conditions"
```

---

### Task 4: NodeConfigPanel — variable + numeric condition editor fields

**Files:**
- Modify: `modules/flows/components/NodeConfigPanel/index.tsx`

**Interfaces:**
- Consumes: `QuestionNodeData`, `ConditionNodeData`, `ComparisonOperator` (Task 1).

- [ ] **Step 1: Add the "Save reply as variable" field to the question case**

In `modules/flows/components/NodeConfigPanel/index.tsx`, inside the `case 'question':` block, after the "Timeout (hours)" `<div>` (originally lines 113-122) and before the closing `</>`, insert:

```tsx
            <div className="space-y-1.5">
              <Label>Save reply as variable (optional)</Label>
              <Input
                value={d.saveAsVariable ?? ''}
                onChange={(e) => set('saveAsVariable', e.target.value)}
                placeholder="e.g. employee_count"
              />
            </div>
```

- [ ] **Step 2: Replace the condition case with a mode toggle**

Replace the entire `case 'condition':` block (originally lines 126-155) with:

```tsx
      case 'condition': {
        const d = formData as Partial<ConditionNodeData>;
        const conditionType = d.conditionType ?? 'keyword';
        return (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={d.label ?? ''} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Condition Type</Label>
              <Select value={conditionType} onValueChange={(v) => set('conditionType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Match keyword in reply</SelectItem>
                  <SelectItem value="variable_compare">Compare a saved number</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {conditionType === 'keyword' ? (
              <>
                <div className="space-y-1.5">
                  <Label>Match Type</Label>
                  <Select value={d.matchType ?? 'contains'} onValueChange={(v) => set('matchType', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="starts_with">Starts with</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Keyword</Label>
                  <Input
                    value={d.keyword ?? ''}
                    onChange={(e) => set('keyword', e.target.value)}
                    placeholder="e.g. yes, no, 1"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Variable Name</Label>
                  <Input
                    value={d.variable ?? ''}
                    onChange={(e) => set('variable', e.target.value)}
                    placeholder="e.g. employee_count"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Operator</Label>
                  <Select value={d.operator ?? '>='} onValueChange={(v) => set('operator', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=">=">&gt;= (greater or equal)</SelectItem>
                      <SelectItem value=">">&gt; (greater than)</SelectItem>
                      <SelectItem value="<">&lt; (less than)</SelectItem>
                      <SelectItem value="<=">&lt;= (less or equal)</SelectItem>
                      <SelectItem value="==">== (equal)</SelectItem>
                      <SelectItem value="!=">!= (not equal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Value</Label>
                  <Input
                    type="number"
                    value={d.value ?? 0}
                    onChange={(e) => set('value', Number(e.target.value))}
                  />
                </div>
              </>
            )}
          </>
        );
      }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual browser verification**

Run: `npm run dev`
Then in a browser:
1. Navigate to the flows list for the VMS workspace, open any flow (a freshly created scratch flow is fine — do not save changes to a real flow in this step).
2. Add a Question node, open its config panel, confirm the new "Save reply as variable (optional)" field appears below Timeout, type `test_var` into it, click elsewhere, and confirm the value persists (re-open the panel).
3. Add a Condition node, open its config panel, confirm the "Condition Type" dropdown shows "Match keyword in reply" by default with the existing Match Type/Keyword fields visible.
4. Switch the dropdown to "Compare a saved number" and confirm Variable Name/Operator/Value fields appear instead.
5. Discard the scratch changes (do not click Save on the flow if you don't want to persist the test nodes — or delete the test nodes and click Save).

- [ ] **Step 5: Commit**

```bash
git add modules/flows/components/NodeConfigPanel/index.tsx
git commit -m "feat(flows): add variable-save and numeric-condition fields to node editor UI"
```

---

### Task 5: Canvas node visuals for variables and numeric conditions

**Files:**
- Modify: `modules/flows/components/nodes/QuestionNode.tsx`
- Modify: `modules/flows/components/nodes/ConditionNode.tsx`

**Interfaces:**
- Consumes: `QuestionNodeData`, `ConditionNodeData` (Task 1).

- [ ] **Step 1: Show the saved variable name on the Question node**

Replace the full contents of `modules/flows/components/nodes/QuestionNode.tsx` with:

```tsx
'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { HelpCircle } from 'lucide-react';
import type { QuestionNodeData } from '../../types';

export function QuestionNode({ data, selected }: NodeProps<QuestionNodeData>) {
  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-purple-500' : 'border-purple-300'}`}>
      <div className="bg-purple-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <HelpCircle className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Question</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        <p className="line-clamp-2">{data.message || 'No question set'}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <span className="inline-block bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 text-[10px]">Waits for reply</span>
          {data.saveAsVariable && (
            <span className="inline-block bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 text-[10px]">
              → {data.saveAsVariable}
            </span>
          )}
        </div>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-purple-500" />
      <Handle type="source" position={Position.Bottom} className="!bg-purple-500" />
    </div>
  );
}
```

- [ ] **Step 2: Show the numeric comparison summary on the Condition node**

Replace the full contents of `modules/flows/components/nodes/ConditionNode.tsx` with:

```tsx
'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';
import type { ConditionNodeData } from '../../types';

export function ConditionNode({ data, selected }: NodeProps<ConditionNodeData>) {
  const isVariableCompare = data.conditionType === 'variable_compare';
  return (
    <div className={`rounded-lg border-2 bg-white shadow-sm w-52 ${selected ? 'border-amber-500' : 'border-amber-300'}`}>
      <div className="bg-amber-500 rounded-t-md px-3 py-1.5 flex items-center gap-2">
        <GitBranch className="h-3.5 w-3.5 text-white" />
        <span className="text-xs font-semibold text-white">Condition</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-600">
        {isVariableCompare ? (
          <p className="font-medium text-amber-700">
            {data.variable || '...'} {data.operator ?? '>='} {data.value ?? 0}
          </p>
        ) : (
          <>
            <p>If reply <span className="font-medium">{data.matchType}</span></p>
            <p className="font-medium text-amber-700">&quot;{data.keyword || '...'}&quot;</p>
          </>
        )}
      </div>
      <Handle type="target" position={Position.Top} className="!bg-amber-500" />
      <Handle type="source" position={Position.Bottom} id="yes" style={{ left: '30%' }} className="!bg-emerald-500" />
      <Handle type="source" position={Position.Bottom} id="no" style={{ left: '70%' }} className="!bg-red-400" />
      <div className="flex justify-between px-4 pb-1 text-[10px]">
        <span className="text-emerald-600 font-medium">Yes</span>
        <span className="text-red-400 font-medium">No</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual browser verification**

With `npm run dev` still running, repeat the scratch-flow steps from Task 4 Step 4 and additionally confirm: the Question node on canvas shows a blue "→ test_var" badge once a variable name is set, and the Condition node on canvas shows "test_var >= 0" text once switched to "Compare a saved number" mode (instead of the keyword text). Discard/delete the scratch nodes afterward.

- [ ] **Step 5: Commit**

```bash
git add modules/flows/components/nodes/QuestionNode.tsx modules/flows/components/nodes/ConditionNode.tsx
git commit -m "feat(flows): show saved variable and numeric condition on canvas node labels"
```

---

### Task 6: Rebuild the VMS Demo Booking Flow data

**Files:**
- Create: `scripts/update_vms_demo_flow.js`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`.
- Produces: updated `nodes`/`edges` JSON on `chatbot_flows` row id `8f4f5254-e373-4c3c-b290-9d5903abeb1f`.

- [ ] **Step 1: Write the update script**

Create `scripts/update_vms_demo_flow.js`:

```js
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const txt = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
  const env = {};
  txt.split('\n').forEach((line) => {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').trim();
  });
  return env;
}

const WORKSPACE_ID = '8a196458-5c09-4403-83e4-23505d0084d7'; // VMS
const FLOW_ID = '8f4f5254-e373-4c3c-b290-9d5903abeb1f'; // Demo Booking Flow

const nodes = [
  {
    id: 'n1',
    type: 'start',
    data: { label: 'Start', triggerType: 'keyword', triggerValue: 'demo' },
    width: 208,
    height: 81,
    position: { x: 250, y: 50 },
  },
  {
    id: 'n2',
    type: 'message',
    data: {
      label: 'Welcome',
      message: '🎉 Bilkul! PagarBook ka demo *completely FREE* hai.\n\nHamari team aapke office visit karke sirf *20–30 minutes* mein software ka live demo degi.\n\nKoi hidden charges nahi, koi commitment nahi. 😊',
    },
    width: 208,
    height: 79,
    position: { x: 250, y: 200 },
  },
  {
    id: 'n3',
    type: 'question',
    data: {
      label: 'Ask Employee Count',
      message: '👥 Sabse pehle batayein, *aapki company mein kitne employees kaam karte hain?*\n\n(Please enter the approximate number.)',
      timeoutHours: 48,
      saveAsVariable: 'employee_count',
    },
    width: 208,
    height: 103,
    position: { x: 250, y: 350 },
  },
  {
    id: 'n4',
    type: 'condition',
    data: {
      label: 'Employee Count Check',
      conditionType: 'variable_compare',
      keyword: '',
      matchType: 'contains',
      variable: 'employee_count',
      operator: '>=',
      value: 10,
    },
    width: 208,
    height: 110,
    position: { x: 250, y: 520 },
  },
  {
    id: 'n5',
    type: 'message',
    data: {
      label: 'Not Eligible Yet',
      message: '🙏 Thank you for your interest in PagarBook.\n\nFilhaal hamara free on-site demo un businesses ke liye available hai jinke paas *minimum 10 employees* hain.\n\nJaise hi aapki team 10 ya usse zyada employees ki ho jaati hai, hume dobara contact karein. Hamari team aapke liye demo schedule kar degi.\n\nDhanyavaad! 😊',
    },
    width: 208,
    height: 79,
    position: { x: 550, y: 690 },
  },
  {
    id: 'n6',
    type: 'question',
    data: {
      label: 'Ask Date',
      message: '📅 Demo ke liye aapko kaunsa din convenient rahega?\n\nExample: Kal, Monday, Weekend ya koi specific date.',
      timeoutHours: 48,
    },
    width: 208,
    height: 103,
    position: { x: 250, y: 690 },
  },
  {
    id: 'n7',
    type: 'question',
    data: {
      label: 'Ask Time',
      message: '⏰ Kis time demo rakhna convenient rahega?\n\nExample:\n• Morning (10 AM – 1 PM)\n• Afternoon (2 PM – 6 PM)',
      timeoutHours: 48,
    },
    width: 208,
    height: 103,
    position: { x: 250, y: 860 },
  },
  {
    id: 'n8',
    type: 'question',
    data: {
      label: 'Ask Location',
      message: '📍 Demo ke liye apne office ka address ya location share karein.',
      timeoutHours: 48,
    },
    width: 208,
    height: 103,
    position: { x: 250, y: 1030 },
  },
  {
    id: 'n9',
    type: 'message',
    data: {
      label: 'Confirmation',
      message: '✅ Perfect! Humne aapki details note kar li hain.\n\nHamari team aapse jaldi contact karegi aur demo schedule confirm karegi.\n\n📞 9999103866\n📞 8285828645\n\nAgar aapke koi aur questions hain, toh zaroor poochiye. 😊',
    },
    width: 208,
    height: 79,
    position: { x: 250, y: 1200 },
  },
  {
    id: 'n10',
    type: 'assign_agent',
    data: {
      label: 'Assign to Sales Team',
      message: 'Demo request received! Aapki team se jald sampark kiya jayega.',
    },
    width: 208,
    height: 79,
    position: { x: 250, y: 1350 },
  },
];

const edges = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n2', target: 'n3' },
  { id: 'e3', source: 'n3', target: 'n4' },
  { id: 'e4', source: 'n4', target: 'n6', sourceHandle: 'yes' },
  { id: 'e5', source: 'n4', target: 'n5', sourceHandle: 'no' },
  { id: 'e6', source: 'n6', target: 'n7' },
  { id: 'e7', source: 'n7', target: 'n8' },
  { id: 'e8', source: 'n8', target: 'n9' },
  { id: 'e9', source: 'n9', target: 'n10' },
];

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const res = await fetch(
    `${url}/rest/v1/chatbot_flows?id=eq.${FLOW_ID}&workspace_id=eq.${WORKSPACE_ID}`,
    {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ nodes, edges, updated_at: new Date().toISOString() }),
    },
  );

  const data = await res.json();
  if (!res.ok) {
    console.error('Update failed:', JSON.stringify(data, null, 2));
    process.exit(1);
  }
  if (Array.isArray(data) && data.length === 0) {
    console.error('No row matched FLOW_ID/WORKSPACE_ID — nothing was updated.');
    process.exit(1);
  }
  console.log('Updated flow nodes:', data[0]?.nodes?.length, 'edges:', data[0]?.edges?.length);
}

main();
```

- [ ] **Step 2: Run the script**

Run: `node scripts/update_vms_demo_flow.js`
Expected output: `Updated flow nodes: 10 edges: 9`

- [ ] **Step 3: Verify the data in Supabase**

Run:

```bash
node -e "
const fs=require('fs');
const txt=fs.readFileSync('.env.local','utf8');
const env={};
txt.split('\n').forEach(l=>{const m=l.match(/^([A-Z_0-9]+)=(.*)\$/);if(m)env[m[1]]=m[2].replace(/^\"|\"\$/g,'').trim();});
fetch(env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/chatbot_flows?select=nodes,edges&id=eq.8f4f5254-e373-4c3c-b290-9d5903abeb1f',{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}})
  .then(r=>r.json()).then(d=>{
    const f=d[0];
    const cond=f.nodes.find(n=>n.type==='condition');
    console.log('condition node data:', JSON.stringify(cond.data));
    console.log('edge from condition:', f.edges.filter(e=>e.source==='n4'));
  });
"
```

Expected: condition node data shows `"conditionType":"variable_compare","variable":"employee_count","operator":">=","value":10`, and two edges from `n4` with `sourceHandle` `"yes"` (target `n6`) and `"no"` (target `n5`).

- [ ] **Step 4: Commit**

```bash
git add scripts/update_vms_demo_flow.js
git commit -m "feat(flows): rebuild VMS Demo Booking Flow with employee-count qualification gate"
```

---

### Task 7: End-to-end manual verification

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Verify the flow visually in the builder**

Run: `npm run dev`. Open the VMS workspace's flow builder, open "Demo Booking Flow", and confirm via `fit view` that it now shows: Start → Welcome → Ask Employee Count → Condition (branches into "Not Eligible Yet" on the No path and "Ask Date → Ask Time → Ask Location → Confirmation → Assign to Sales Team" on the Yes path).

- [ ] **Step 2: Verify the ≥10 branch on live WhatsApp**

Send "demo" to the VMS WhatsApp number from a test phone. Reply to the employee count question with a number ≥10 (e.g. "15"). Confirm the bot proceeds to ask for date, then time, then location, then sends the confirmation message with both phone numbers, then the conversation status changes to pending/assigned (visible in the dashboard's conversations view).

- [ ] **Step 3: Verify the <10 branch on live WhatsApp**

Start a fresh conversation (or wait for the prior session to complete), send "demo" again, and reply to the employee count question with a number below 10 (e.g. "4"). Confirm the bot sends the "minimum 10 employees" rejection message and does not ask for date/time/location.

- [ ] **Step 4: Verify the unparseable-reply edge case**

Start another fresh conversation, send "demo", and reply to the employee count question with non-numeric text (e.g. "bahut log hain"). Confirm the bot treats this the same as the <10 case and sends the rejection message (per the accepted design trade-off: no digits found → treated as below threshold).

- [ ] **Step 5: Confirm no regression in another live flow**

Pick one other active flow in any workspace that uses a keyword Condition node (e.g. the `FAQ_BOT`-style template if one is in use), and manually trigger it end-to-end to confirm keyword-based branching still works unchanged.
