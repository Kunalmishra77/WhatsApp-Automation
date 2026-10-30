// lib/flow-generate.ts
//
// What the AI flow builder is told, and what is done to what it sends back.
//
// The prompt it replaces described six node types; the palette has thirteen, so
// every flow it produced was built from the half of the editor that existed in
// May — no Wait, no Collect, no Template, no AI Reply. A generated flow was
// therefore always less than a client could build by hand, which is the opposite
// of the point.
//
// Nothing here calls a model or a database: the route does that, and this is
// the prompt plus a parser, so both are tested directly.
//
// On repairs: a model will occasionally name a node type that does not exist or
// draw an edge to a node it never wrote. The engine treats an unknown type as a
// reason to end the session and a dangling edge as the end of the flow, so
// handing either to the author produces a flow that looks finished on the canvas
// and stops dead on WhatsApp. Those are removed and reported. Anything
// ambiguous — a branch handle that does not match the node's branches — is left
// exactly as the model drew it, for the validator to warn about and the author
// to decide. Guessing which branch was meant is how a builder becomes
// confidently wrong.

import { handlerFor, handlesForNode } from './flow-nodes';
import type { FlowNode, FlowEdge } from '@/modules/flows/types';

/**
 * The palette, as the model is told about it. Each entry lists the data fields
 * the node's own handler reads — not a description of the node, the fields it
 * actually uses, so a generated flow runs rather than merely looking right.
 */
const PALETTE = [
  ['start', 'entry point, exactly one per flow',
   'triggerType: "keyword"|"first_message", triggerValue: string'],
  ['message', 'sends a message and carries straight on',
   'message: string'],
  ['question', 'asks, then waits for the reply',
   'message: string, timeoutHours: number, saveAsVariable: string, ' +
   'answerMode: "text"|"buttons"|"list", choices: [{id,title,description?}] ' +
   '(max 3 for buttons, 10 for a list; each choice gets its own outgoing edge ' +
   'with sourceHandle "choice_<id>"), listButtonText, header, footer'],
  ['collect', 'asks, CHECKS the answer, re-asks in your words, gives up down its own branch',
   'message: string, expects: "any"|"name"|"phone"|"email"|"number"|"date"|"time", ' +
   'saveAsVariable: string, retryMessage: string, maxAttempts: number, timeoutHours: number. ' +
   'Branches: the default edge, plus one with sourceHandle "gave_up"'],
  ['condition', 'judges the last message or a saved number, two branches',
   'conditionType: "keyword"|"variable_compare", keyword: string, ' +
   'matchType: "contains"|"equals"|"starts_with", variable, operator, value. ' +
   'Branches: sourceHandle "yes" and "no"'],
  ['wait', 'pauses the flow; the customer can still talk to the bot meanwhile',
   'mode: "duration"|"time", minutes/hours/days: number, atTime: "HH:MM", weekday: 0-6'],
  ['template', 'an approved WhatsApp template — the ONLY message allowed more than 24h after the customer last wrote',
   'templateName: string, language: string, bodyParams: string[] (fill {{1}},{{2}} in order)'],
  ['ai_reply', 'hands one turn to the workspace persona and knowledge base, then carries on',
   'instruction: string (narrow it, e.g. "only about pricing"), fallbackMessage: string'],
  ['media', 'sends an image, video, document, audio or a location',
   'kind: "image"|"video"|"document"|"audio"|"location", url, caption, filename, ' +
   'latitude, longitude, locationName, address'],
  ['action', 'changes CRM state; sends nothing',
   'operations: [{type:"add_tags",tags}|{type:"remove_tags",tags}|' +
   '{type:"set_temperature",temperature:"hot"|"warm"|"cold"}|{type:"set_field",field,value}|' +
   '{type:"create_task",title,dueInHours?}|{type:"notify_team",message,channel?}|{type:"opt_out"}]'],
  ['webhook', 'posts what the flow collected to a URL the client controls and reads values back',
   'url: string, method: "POST"|"GET", body: [{key,value}], ' +
   'saveFrom: [{responseKey,saveAs}], timeoutSeconds: number. ' +
   'Branches: sourceHandle "ok" and "failed"'],
  ['assign_agent', 'parks the conversation for a human and ends the flow',
   'message: string'],
  ['end', 'ends the flow, optionally with a last message',
   'message: string'],
] as const;

/**
 * Written as rules the model can follow rather than advice, because the
 * previous prompt's "Lead classification: use condition nodes to detect hot
 * keywords" produced the same three-condition flow for every description.
 */
export const FLOW_SYSTEM_PROMPT = `You design WhatsApp automation flows for Indian small businesses. Given a description, return ONE flow as JSON.

NODE TYPES — use the full palette, not only messages and questions:
${PALETTE.map(([type, what, fields]) => `- "${type}" — ${what}\n    data: ${fields}`).join('\n')}

WRITING THE COPY
- Write in the language the business writes to its own customers. For an Indian SMB that is usually a mix of Hindi and English in Roman script ("Aapka naam bata dijiye 😊"), unless the description says otherwise.
- Keep each message to one or two short lines. WhatsApp is not email.
- Use {{variableName}} to read back something a question or collect step saved. Never read a variable before a step has saved it.

RULES
1. Exactly one "start" node. Every path ends at "end" or "assign_agent".
2. Ask for a name, phone or email with "collect", never "question" — collect checks the answer and re-asks; question saves whatever arrives, including "ok sure".
3. Offer "choices" on a question when the answers are a short known set. Tapping beats typing, and each choice needs its own edge with sourceHandle "choice_<id>".
4. A "wait" of more than 24 hours must be followed by "template", not "message". WhatsApp refuses everything else outside that window, so a plain message after a long wait sends nothing at all.
5. Use "ai_reply" where the customer may ask anything — it answers from the business's own knowledge base instead of you guessing their prices.
6. Use "action" to tag the lead or set its temperature, so the flow feeds the CRM rather than only talking.
7. Edges: { id, source, target, sourceHandle? }. A branching node needs one edge per branch, with the sourceHandle named above. Never draw an edge to a node you did not create.
8. Positions: start at {x:250,y:50}, 150px down per step, 300px apart per branch.

Return ONLY JSON:
{
  "name": "short flow name",
  "description": "one line",
  "trigger_type": "keyword" | "first_message",
  "trigger_value": "string or null",
  "nodes": [{ "id": "n1", "type": "start", "position": {"x":250,"y":50}, "data": {"label":"Start","triggerType":"keyword","triggerValue":"hi"} }],
  "edges": [{ "id": "e1", "source": "n1", "target": "n2" }]
}`;

export interface GeneratedFlow {
  name: string;
  description: string;
  trigger_type: 'keyword' | 'first_message';
  trigger_value: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface GenerateResult {
  flow: GeneratedFlow;
  /** What had to be changed to make the flow runnable, in the author's words. */
  repairs: string[];
}

/** Strips a ```json fence, which models add despite being asked for raw JSON. */
export function extractJsonObject(raw: string): string | null {
  const text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced?.[1]) return fenced[1].trim();
  // A model that added a sentence before the JSON: take the outermost object.
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  return text.slice(first, last + 1);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function position(value: unknown, index: number): { x: number; y: number } {
  const p = value as { x?: unknown; y?: unknown } | undefined;
  const x = typeof p?.x === 'number' && Number.isFinite(p.x) ? p.x : 250;
  const y = typeof p?.y === 'number' && Number.isFinite(p.y) ? p.y : 50 + index * 150;
  return { x, y };
}

/**
 * Turns the model's JSON into a flow the engine can run, or null when there is
 * nothing usable in it.
 *
 * Only unambiguous repairs are made, and each is reported: a node type that does
 * not exist, an edge to a node that does not, a missing start, a duplicate or
 * missing id, a missing position. Everything else is handed to the author as
 * the model drew it, for the editor's own validation to warn about.
 */
export function parseGeneratedFlow(raw: string): GenerateResult | null {
  const json = extractJsonObject(raw);
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const rawEdges = Array.isArray(obj.edges) ? obj.edges : [];
  if (rawNodes.length === 0) return null;

  const repairs: string[] = [];
  const seenIds = new Set<string>();
  const nodes: FlowNode[] = [];

  rawNodes.forEach((entry, index) => {
    const n = entry as Record<string, unknown>;
    const type = str(n.type);

    // The engine ends the session on a type it cannot run, so a flow carrying
    // one is a flow that stops mid-conversation with nothing in the editor to
    // show why.
    if (!handlerFor(type)) {
      repairs.push(`Removed a "${type || 'nameless'}" step — there is no such step in the builder.`);
      return;
    }

    let id = str(n.id).trim();
    if (!id || seenIds.has(id)) {
      const replacement = `${type}-${index + 1}`;
      repairs.push(id ? `Renamed a second step called "${id}".` : 'Gave a step with no id a name.');
      id = seenIds.has(replacement) ? `${replacement}-${index}` : replacement;
    }
    seenIds.add(id);

    const data = (typeof n.data === 'object' && n.data !== null ? n.data : {}) as Record<string, unknown>;
    if (!str(data.label)) data.label = type === 'start' ? 'Start' : type.replace(/_/g, ' ');

    // `as unknown as FlowNode`: FlowNodeData is a union whose members each
    // require their own fields, and a model's reply is by definition not
    // known to satisfy any of them yet. The editor reads these fields
    // defensively and the validator is what reports the gaps.
    nodes.push({ id, type, position: position(n.position, index), data } as unknown as FlowNode);
  });

  if (nodes.length === 0) return null;

  // Without a start node `startFlow` refuses the flow outright, so it can never
  // run and the editor shows no reason. Added pointing at whatever came first.
  let start = nodes.find((n) => n.type === 'start');
  const synthesizedStart = !start;
  if (!start) {
    start = {
      id: 'start-1',
      type: 'start',
      position: { x: 250, y: 50 },
      data: { label: 'Start', triggerType: 'keyword', triggerValue: str(obj.trigger_value) },
    } as unknown as FlowNode;
    nodes.unshift(start);
    seenIds.add('start-1');
    repairs.push('Added the missing Start step.');
  }

  const ids = new Set(nodes.map((n) => n.id));
  const edges: FlowEdge[] = [];
  const seenEdgeIds = new Set<string>();

  rawEdges.forEach((entry, index) => {
    const e = entry as Record<string, unknown>;
    const source = str(e.source);
    const target = str(e.target);
    if (!ids.has(source) || !ids.has(target)) {
      repairs.push(`Removed a connection to a step that does not exist ("${target || source}").`);
      return;
    }
    let id = str(e.id).trim();
    if (!id || seenEdgeIds.has(id)) id = `e-${source}-${target}-${index}`;
    seenEdgeIds.add(id);

    const handle = str(e.sourceHandle).trim();
    const edge: FlowEdge = { id, source, target } as FlowEdge;
    if (handle) {
      // A handle the node cannot produce is left in place on purpose. The model
      // drew that line deliberately, walk.ts already treats an unmatched handle
      // as no worse than a missing one, and choosing a different branch on the
      // author's behalf would be a guess they never see.
      (edge as { sourceHandle?: string }).sourceHandle = handle;
      const available = handlesForNode(
        nodes.find((n) => n.id === source)?.type,
        nodes.find((n) => n.id === source)?.data,
      );
      if (available.length > 0 && !available.includes(handle)) {
        repairs.push(
          `Kept a "${handle}" branch on "${source}" that does not match its branches (${available.join(', ')}) — check it.`,
        );
      }
    }
    edges.push(edge);
  });

  if (synthesizedStart) {
    const firstReal = nodes.find((n) => n.type !== 'start');
    if (firstReal && !edges.some((e) => e.source === start!.id)) {
      edges.unshift({ id: `e-start-${firstReal.id}`, source: start.id, target: firstReal.id } as FlowEdge);
    }
  }

  const triggerType = obj.trigger_type === 'first_message' ? 'first_message' : 'keyword';
  const startData = start.data as { triggerValue?: unknown };
  const triggerValue =
    str(obj.trigger_value, str(startData.triggerValue)).trim() || null;

  return {
    flow: {
      name: str(obj.name).trim() || 'Untitled flow',
      description: str(obj.description).trim(),
      trigger_type: triggerType,
      trigger_value: triggerType === 'first_message' ? null : triggerValue,
      nodes,
      edges,
    },
    repairs,
  };
}
