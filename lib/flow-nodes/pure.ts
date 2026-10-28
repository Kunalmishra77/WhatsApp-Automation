// lib/flow-nodes/pure.ts
//
// The flow engine's decision-making, with no database, network or AI in it.
//
// These functions used to live in lib/flow-engine.ts alongside the code that
// sends WhatsApp messages. Node handlers need them, and the engine imports the
// handlers, so sharing them through the engine would be a cycle. lib/flow-engine
// re-exports every name below, which is what keeps tests/flow-engine.test.ts
// passing against its original import path.

import type { FlowNode, ConditionNodeData, ComparisonOperator, QuestionNodeData } from '@/modules/flows/types';
import type { FlowContext } from './types';

export function matchesCondition(
  reply: string,
  keyword: string,
  matchType: 'contains' | 'equals' | 'starts_with',
): boolean {
  const r = reply.toLowerCase().trim();
  const k = keyword.toLowerCase().trim();
  switch (matchType) {
    case 'equals':      return r === k;
    case 'starts_with': return r.startsWith(k);
    case 'contains':
    default:            return r.includes(k);
  }
}

// Intentionally integer-only, first-match: decimals/negatives/grouping aren't
// parsed specially (e.g. "3.5" -> 3, "-5" -> 5), and no digits found -> 0,
// which routes a condition check toward the below-threshold branch by design.
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
  context: FlowContext,
): boolean {
  if (data.conditionType === 'variable_compare') {
    const variableName = data.variable ?? '';
    const raw = context[variableName];
    // Only numeric entries are used for comparisons; _text entries are skipped
    const value = typeof raw === 'number' ? raw : 0;
    return compareNumeric(value, data.operator ?? '>=', data.value ?? 0);
  }
  return matchesCondition(incomingMessage, data.keyword, data.matchType);
}

// ── Template interpolation ─────────────────────────────────────────────────────
// Replaces {{variable}} placeholders in outbound copy with captured answers.
// Prefers the raw text answer (`${key}_text`), falls back to the numeric value,
// and resolves unknown placeholders to an empty string.
//
// The key pattern admits a dot so built-ins can live under `system.` —
// {{system.contact_name}} — without colliding with a question's variable. Flows
// written before that namespace existed contain no dots and are unaffected.
export function interpolateTemplate(text: string, context: FlowContext): string {
  if (!text || !text.includes('{{')) return text;
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => {
    const t = context[`${key}_text`];
    if (t !== undefined && t !== null && String(t).length > 0) return String(t);
    const v = context[key];
    return v !== undefined && v !== null ? String(v) : '';
  });
}

/** The {{placeholder}} names a piece of copy reads. Used by `describe`. */
export function placeholdersIn(text: string | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) out.add(m[1]!);
  return [...out];
}

// ── Smart extraction helpers ───────────────────────────────────────────────────
// Counts how many question nodes save into each variable. A variable used by
// more than one question is ambiguous (some flows reuse a single variable for
// every question); such variables are excluded from extraction and skip-ahead.
export function questionVarCounts(nodes: FlowNode[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    if (n.type === 'question') {
      const v = (n.data as QuestionNodeData).saveAsVariable;
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return counts;
}

// Heuristic gate: only spend an AI extraction call when the reply plausibly
// carries more than one field. Short, single-value answers (the norm) skip
// extraction, so cost and behaviour are unchanged for the vast majority of
// messages — and for every existing flow whose users answer one thing at a time.
export function looksMultiField(message: string): boolean {
  const t = message.trim();
  if (t.length < 15) return false;
  const words = t.split(/\s+/).length;
  const separators = (t.match(/[,;\n]/g)?.length ?? 0) + (/\band\b/i.test(t) ? 1 : 0);
  return words >= 5 && (separators >= 1 || words >= 8);
}

// A downstream question can be skipped only when its answer is already known:
// the variable is unique within the flow, present in context, and the node is
// not marked forceAsk (validation re-ask loops set forceAsk so they always run).
export function isSkippableQuestion(
  node: FlowNode,
  varCounts: Map<string, number>,
  context: FlowContext,
): boolean {
  if (node.type !== 'question') return false;
  const d = node.data as QuestionNodeData & { forceAsk?: boolean };
  const v = d.saveAsVariable;
  if (!v || d.forceAsk) return false;
  if ((varCounts.get(v) ?? 0) !== 1) return false;
  return context[`${v}_text`] !== undefined;
}

export interface ExtractField { variable: string; description: string; }

// Builds the list of fields extraction may fill: unique question variables only.
export function extractableFields(nodes: FlowNode[], varCounts: Map<string, number>): ExtractField[] {
  const out: ExtractField[] = [];
  for (const n of nodes) {
    if (n.type !== 'question') continue;
    const d = n.data as QuestionNodeData;
    const v = d.saveAsVariable;
    if (!v || (varCounts.get(v) ?? 0) !== 1) continue;
    out.push({ variable: v, description: (d.label || d.message || v).slice(0, 60) });
  }
  return out;
}

// Parses the model's JSON reply, keeping only allowed keys with non-empty values.
// Tolerant of prose around the JSON and of numeric values. Never throws.
export function parseExtraction(raw: string, allowed: string[]): Record<string, string> {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const k of allowed) {
      const val = obj[k];
      if (typeof val === 'string' && val.trim().length > 0) out[k] = val.trim();
      else if (typeof val === 'number') out[k] = String(val);
    }
    return out;
  } catch {
    return {};
  }
}
