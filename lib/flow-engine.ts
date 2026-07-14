import { createAdminClient } from '@/services/supabase/admin';
import { callAI } from '@/lib/ai-client';
import type {
  FlowNode, FlowEdge, ChatbotFlow,
  QuestionNodeData, ConditionNodeData, ComparisonOperator,
} from '@/modules/flows/types';

type AdminClient = ReturnType<typeof createAdminClient>;

// Context stores numeric values (used by condition nodes) AND raw text answers
// (used for Google Sheets sync). Text answers use the key suffix `_text`.
type FlowContext = Record<string, number | string>;

async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.replace(/﻿/g, '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        ...payload,
      }),
    });
    if (!res.ok) {
      console.error('[FlowEngine] WhatsApp send error:', await res.text());
      return null;
    }
    const data = await res.json() as { messages?: Array<{ id: string }> };
    return data?.messages?.[0]?.id ?? null;
  } catch (err) {
    console.error('[FlowEngine] WhatsApp fetch error:', err);
    return null;
  }
}

function sendWhatsAppText(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  text: string,
): Promise<string | null> {
  return sendWhatsAppMessage(phoneNumberId, accessToken, toPhone, {
    type: 'text',
    text: { preview_url: false, body: text },
  });
}

function sendWhatsAppButtons(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  body: string,
  buttons: string[],
  header?: string,
  footer?: string,
): Promise<string | null> {
  return sendWhatsAppMessage(phoneNumberId, accessToken, toPhone, {
    type: 'interactive',
    interactive: {
      type: 'button',
      ...(header ? { header: { type: 'text', text: header } } : {}),
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((title, i) => ({
          type: 'reply',
          reply: { id: `btn_${i}`, title: title.slice(0, 20) },
        })),
      },
    },
  });
}

async function saveOutboundMessage(
  supabase: AdminClient,
  workspaceId: string,
  conversationId: string,
  text: string,
  waMessageId: string | null,
  msgType: 'text' | 'interactive' = 'text',
) {
  const now = new Date().toISOString();
  await (supabase as any).from('messages').insert({
    conversation_id: conversationId,
    workspace_id:    workspaceId,
    sender_type:     'bot',
    sender_id:       null,
    direction:       'outbound',
    type:            msgType,
    content:         text,
    status:          'sent',
    whatsapp_msg_id: waMessageId,
    created_at:      now,
  });
  await (supabase as any).from('conversations').update({
    last_message:    text,
    last_message_at: now,
  }).eq('id', conversationId);
}

function findNextNode(
  nodes: FlowNode[],
  edges: FlowEdge[],
  currentNodeId: string,
  handleId?: string,
): FlowNode | null {
  const edge = edges.find((e) =>
    e.source === currentNodeId && (handleId ? e.sourceHandle === handleId : true),
  );
  if (!edge) return null;
  return nodes.find((n) => n.id === edge.target) ?? null;
}

function matchesCondition(
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
// and resolves unknown placeholders to an empty string. Existing flows contain
// no placeholders, so their messages pass through unchanged.
export function interpolateTemplate(text: string, context: FlowContext): string {
  if (!text || !text.includes('{{')) return text;
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const t = context[`${key}_text`];
    if (t !== undefined && t !== null && String(t).length > 0) return String(t);
    const v = context[key];
    return v !== undefined && v !== null ? String(v) : '';
  });
}

// ── Smart extraction helpers ───────────────────────────────────────────────────
// Counts how many question nodes save into each variable. A variable used by
// more than one question is ambiguous (some flows reuse a single variable for
// every question); such variables are excluded from extraction and skip-ahead.
function questionVarCounts(nodes: FlowNode[]): Map<string, number> {
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

interface ExtractField { variable: string; description: string; }

// Builds the list of fields extraction may fill: unique question variables only.
function extractableFields(nodes: FlowNode[], varCounts: Map<string, number>): ExtractField[] {
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

// Asks the model to pull any explicitly-present fields from a single message.
// Strict prompt + temperature 0; returns {} on any error so the flow proceeds
// exactly as it would without extraction.
async function extractFlowVariables(
  message: string,
  fields: ExtractField[],
): Promise<Record<string, string>> {
  if (fields.length === 0) return {};
  const schema = fields.map((f) => `"${f.variable}": <${f.description}>`).join(', ');
  try {
    const result = await callAI(
      [
        { role: 'system', content:
          'Extract structured fields from the user message for a booking flow. ' +
          'Return ONLY a JSON object. Include a key ONLY if its value is explicitly ' +
          'and unambiguously present in the message. Omit anything uncertain — never guess.' },
        { role: 'user', content: `Fields: {${schema}}\n\nMessage: "${message}"\n\nJSON:` },
      ],
      { model: 'openai/gpt-4o-mini', maxTokens: 200, temperature: 0 },
    );
    return parseExtraction(result ?? '', fields.map((f) => f.variable));
  } catch {
    return {};
  }
}

// ── Off-topic inquiry detection ────────────────────────────────────────────────
// Uses AI to reliably classify whether the user's message answers the current
// flow question or is asking something unrelated. Two fast paths skip the AI
// call for unambiguous cases.
async function isOffTopicReply(flowQuestion: string, userMessage: string): Promise<boolean> {
  const m = userMessage.trim().toLowerCase();

  // Fast path 1 — pure number or very short numeric reply → always an answer
  if (/^\d+$/.test(m) || (/\d/.test(m) && m.length < 20)) return false;

  // Fast path 2 — product name explicitly in message → always off-topic
  if (/\bpagarbook\b/i.test(m)) return true;

  // AI classification for everything else (handles any language / phrasing)
  try {
    const result = await callAI(
      [
        {
          role: 'system',
          content:
            'A chatbot is running a structured booking flow. Decide if the user\'s reply is answering the bot\'s question or asking something unrelated.\n' +
            'Reply with ONLY the letter:\n' +
            'A — reply answers (or attempts to answer) the bot\'s question\n' +
            'B — reply is a new question, complaint, or completely off-topic',
        },
        {
          role: 'user',
          content: `Bot asked: "${flowQuestion}"\nUser replied: "${userMessage}"\n\nA or B?`,
        },
      ],
      { model: 'openai/gpt-4o-mini', maxTokens: 3, temperature: 0 },
    );
    return result?.trim().toUpperCase().startsWith('B') ?? false;
  } catch {
    // On AI error: treat as a valid answer so the flow is never permanently stuck
    return false;
  }
}

// ── Google Sheets notification ─────────────────────────────────────────────────
// Fires when an assign_agent node completes. Checks if the workspace has a
// `sheets_webhook_url` in its settings; if so, POSTs the captured answers.
async function notifyGoogleSheets(
  supabase: AdminClient,
  workspaceId: string,
  conversationId: string,
  contactPhone: string,
  context: FlowContext,
): Promise<void> {
  try {
    const { data: ws } = await (supabase as any)
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single();

    const webhookUrl = (ws?.settings as Record<string, unknown> | null)?.sheets_webhook_url as string | undefined;
    if (!webhookUrl) return;

    const { data: contactRow } = await (supabase as any)
      .from('contacts')
      .select('name')
      .eq('phone', contactPhone)
      .eq('workspace_id', workspaceId)
      .single();

    const payload = {
      timestamp:               new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      phone:                   contactPhone,
      name:                    (contactRow?.name as string | null) ?? '',
      business_employee_count: context['employee_count_text'] ?? String(context['employee_count'] ?? ''),
      attendance_method:       context['attendance_method_text'] ?? '',
      calculator_person:       context['calculator_person_text'] ?? '',
      calculation_time:        context['calculation_time_text'] ?? '',
      demo_date:               context['demo_date_text'] ?? '',
      demo_time:               context['demo_time_text'] ?? '',
      demo_address:            context['demo_address_text'] ?? '',
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log(`[FlowEngine] Google Sheets notified for conversation ${conversationId}`);
  } catch (err) {
    console.error('[FlowEngine] Google Sheets notification failed:', err);
  }
}

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
  context: FlowContext,
): Promise<boolean> {
  // Returns true = flow is still active (session should remain)

  switch (node.type) {
    case 'start': {
      // Find the next node after start and execute it
      const next = findNextNode(nodes, edges, node.id);
      if (!next) {
        await endSession(supabase, sessionId);
        return false;
      }
      // Advance session to next node
      await updateSession(supabase, sessionId, next.id);
      return executeNode(
        supabase, next, nodes, edges, workspaceId, conversationId,
        sessionId, incomingMessage, phoneNumberId, accessToken, contactPhone, context,
      );
    }

    case 'message': {
      const d = node.data as { message: string };
      if (d.message) {
        const text = interpolateTemplate(d.message, context);
        const waId = await sendWhatsAppText(phoneNumberId, accessToken, contactPhone, text);
        await saveOutboundMessage(supabase, workspaceId, conversationId, text, waId);
      }
      const next = findNextNode(nodes, edges, node.id);
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

    case 'question': {
      // Skip-ahead: if this answer was already captured via smart extraction
      // (unique variable, present in context, not forceAsk), advance without
      // re-asking. Protects existing flows via the guards in isSkippableQuestion.
      if (isSkippableQuestion(node, questionVarCounts(nodes), context)) {
        const skipNext = findNextNode(nodes, edges, node.id);
        if (!skipNext) {
          await endSession(supabase, sessionId);
          return false;
        }
        await updateSession(supabase, sessionId, skipNext.id);
        return executeNode(
          supabase, skipNext, nodes, edges, workspaceId, conversationId,
          sessionId, incomingMessage, phoneNumberId, accessToken, contactPhone, context,
        );
      }

      const d = node.data as { message: string; buttons?: string[]; footer?: string; header?: string };
      if (d.message) {
        const text = interpolateTemplate(d.message, context);
        let waId: string | null;
        if (d.buttons && d.buttons.length > 0) {
          // Send interactive button message — customer taps instead of typing
          waId = await sendWhatsAppButtons(phoneNumberId, accessToken, contactPhone, text, d.buttons, d.header, d.footer);
          await saveOutboundMessage(supabase, workspaceId, conversationId, text, waId, 'interactive');
        } else {
          waId = await sendWhatsAppText(phoneNumberId, accessToken, contactPhone, text);
          await saveOutboundMessage(supabase, workspaceId, conversationId, text, waId);
        }
      }
      // Wait for reply — session stays on this node
      await updateSession(supabase, sessionId, node.id);
      return true;
    }

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

    case 'assign_agent': {
      const d = node.data as { message: string };
      if (d.message) {
        const text = interpolateTemplate(d.message, context);
        const waId = await sendWhatsAppText(phoneNumberId, accessToken, contactPhone, text);
        await saveOutboundMessage(supabase, workspaceId, conversationId, text, waId);
      }
      // Set conversation to pending (human handoff)
      await (supabase as any).from('conversations').update({ status: 'pending' }).eq('id', conversationId);
      await endSession(supabase, sessionId);
      // Notify Google Sheets if workspace has a webhook configured (fire-and-forget)
      notifyGoogleSheets(supabase, workspaceId, conversationId, contactPhone, context).catch(() => {});
      return false;
    }

    case 'end': {
      const d = node.data as { message: string };
      if (d.message) {
        const text = interpolateTemplate(d.message, context);
        const waId = await sendWhatsAppText(phoneNumberId, accessToken, contactPhone, text);
        await saveOutboundMessage(supabase, workspaceId, conversationId, text, waId);
      }
      await endSession(supabase, sessionId);
      return false;
    }

    default:
      await endSession(supabase, sessionId);
      return false;
  }
}

async function updateSession(supabase: AdminClient, sessionId: string, nodeId: string) {
  await (supabase as any).from('flow_sessions').update({
    current_node_id: nodeId,
    updated_at: new Date().toISOString(),
  }).eq('id', sessionId);
}

async function endSession(supabase: AdminClient, sessionId: string) {
  await (supabase as any).from('flow_sessions').update({
    status: 'completed',
    updated_at: new Date().toISOString(),
  }).eq('id', sessionId);
}

// Returned by processFlowForMessage:
//   true                     → flow fully handled (skip AI)
//   false                    → no active flow / no trigger match (AI handles normally)
//   { pendingQuestion:string }→ off-topic interruption in active flow; AI should answer
//                               the user's question first, then re-ask pendingQuestion
export type FlowHandleResult = true | false | { pendingQuestion: string };

export async function processFlowForMessage(
  supabase: AdminClient,
  workspaceId: string,
  conversationId: string,
  contactId: string,
  messageContent: string,
  phoneNumberId: string,
  accessToken: string,
  contactPhone: string,
): Promise<FlowHandleResult> {
  try {
    // Check for active session
    const { data: session } = await (supabase as any)
      .from('flow_sessions')
      .select('*, chatbot_flows(*)')
      .eq('conversation_id', conversationId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session) {
      const flow = session.chatbot_flows as ChatbotFlow;
      if (!flow) return false;
      const nodes = (flow.nodes ?? []) as FlowNode[];
      const edges = (flow.edges ?? []) as FlowEdge[];
      const currentNodeId = session.current_node_id as string;
      const currentNode = nodes.find((n) => n.id === currentNodeId);
      if (!currentNode) {
        await endSession(supabase, session.id as string);
        return false;
      }

      // For question nodes waiting for a reply: advance only if message looks like an answer.
      // If the user sends an off-topic question instead, re-ask the current question
      // and keep the session on this node so no data is lost.
      if (currentNode.type === 'question') {
        const qData = currentNode.data as QuestionNodeData;

        if (await isOffTopicReply(qData.message, messageContent)) {
          // Signal the webhook to let AI answer first, then re-ask this question.
          // Session stays on the current node — no variable is saved, flow doesn't advance.
          return { pendingQuestion: qData.message };
        }

        let context: FlowContext = (session.context as FlowContext) ?? {};
        if (qData.saveAsVariable) {
          context = {
            ...context,
            // Numeric value for condition nodes
            [qData.saveAsVariable]:            parseNumberFromReply(messageContent),
            // Raw text for Google Sheets and display
            [`${qData.saveAsVariable}_text`]:  messageContent.trim(),
          };
        }

        // Smart extraction: when the reply plausibly carries several fields,
        // pull any other unique flow variables the user volunteered so the
        // engine can skip those questions. Gated + strict, so simple single
        // answers and existing flows are unaffected.
        const varCounts = questionVarCounts(nodes);
        if (looksMultiField(messageContent)) {
          const fields = extractableFields(nodes, varCounts)
            .filter((f) => f.variable !== qData.saveAsVariable);
          const extracted = await extractFlowVariables(messageContent, fields);
          for (const [k, v] of Object.entries(extracted)) {
            context = { ...context, [k]: parseNumberFromReply(v), [`${k}_text`]: v };
          }
        }

        if (qData.saveAsVariable || Object.keys(context).length > 0) {
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
        const context: FlowContext = (session.context as FlowContext) ?? {};
        await executeNode(
          supabase, currentNode, nodes, edges, workspaceId, conversationId,
          session.id as string, messageContent, phoneNumberId, accessToken, contactPhone, context,
        );
      } else {
        // Shouldn't be waiting on other node types, just advance
        const context: FlowContext = (session.context as FlowContext) ?? {};
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
      return true;
    }

    // No active session — check for matching flow
    const { data: flows } = await (supabase as any)
      .from('chatbot_flows')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true);

    if (!flows || flows.length === 0) return false;

    // Count inbound messages in conversation to detect first message
    const { count: msgCount } = await (supabase as any)
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound');

    const isFirstMessage = (msgCount ?? 0) <= 1;
    const lowerContent = messageContent.toLowerCase().trim();

    let matchedFlow: ChatbotFlow | null = null;
    for (const flow of flows as ChatbotFlow[]) {
      if (flow.trigger_type === 'first_message' && isFirstMessage) {
        matchedFlow = flow;
        break;
      }
      if (flow.trigger_type === 'keyword' && flow.trigger_value) {
        const kw = flow.trigger_value.toLowerCase().trim();
        if (lowerContent.includes(kw)) {
          matchedFlow = flow;
          break;
        }
      }
    }

    if (!matchedFlow) return false;

    const nodes = (matchedFlow.nodes ?? []) as FlowNode[];
    const edges = (matchedFlow.edges ?? []) as FlowEdge[];
    const startNode = nodes.find((n) => n.type === 'start');
    if (!startNode) return false;

    // Create new session
    const { data: newSession, error: sessionError } = await (supabase as any)
      .from('flow_sessions')
      .insert({
        flow_id:         matchedFlow.id,
        workspace_id:    workspaceId,
        conversation_id: conversationId,
        contact_id:      contactId,
        current_node_id: startNode.id,
        status:          'active',
        context:         {},
      })
      .select()
      .single();

    if (sessionError || !newSession) {
      console.error('[FlowEngine] Failed to create session:', sessionError?.message);
      return false;
    }

    await executeNode(
      supabase, startNode, nodes, edges, workspaceId, conversationId,
      newSession.id as string, messageContent, phoneNumberId, accessToken, contactPhone, {},
    );

    return true;
  } catch (err) {
    console.error('[FlowEngine] Error:', err);
    return false;
  }
}
