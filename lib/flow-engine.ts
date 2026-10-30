import { createAdminClient } from '@/services/supabase/admin';
import { callAI } from '@/lib/ai-client';
import { notifyWorkspaceSheets } from '@/lib/sheets-notify';
import { handlerFor } from './flow-nodes';
import type { FlowOps, SendFacade, NodeResult, ListSection, MediaKind } from './flow-nodes/types';
import {
  evaluateCondition, interpolateTemplate, isSkippableQuestion, looksMultiField,
  parseNumberFromReply, questionVarCounts, extractableFields, parseExtraction,
  type ExtractField,
} from './flow-nodes/pure';
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
  }).eq('id', conversationId).eq('workspace_id', workspaceId);
}

// Resolves the edge a node's outcome asks for.
//
// The old version ignored `handleId` when none was passed and took the first
// edge whose source matched, so a node with two outgoing edges followed one of
// them and the author was never told which. Now a handle is matched exactly, and
// an unwired handle falls back to an edge with no handle of its own — an author
// who wired one line out of a branching node meant that line to be the default,
// and a flow that stops dead mid-conversation is the worse reading.
function findNextNode(
  nodes: FlowNode[],
  edges: FlowEdge[],
  currentNodeId: string,
  handleId?: string,
): FlowNode | null {
  const outgoing = edges.filter((e) => e.source === currentNodeId);
  const edge = handleId
    ? outgoing.find((e) => e.sourceHandle === handleId)
      ?? outgoing.find((e) => !e.sourceHandle)
    : outgoing[0];
  if (!edge) return null;
  return nodes.find((n) => n.id === edge.target) ?? null;
}

// ── Decision-making ───────────────────────────────────────────────────────────
// These used to be defined here. They moved to lib/flow-nodes/pure.ts so node
// handlers can use them without importing the engine that imports the handlers.
// They are re-exported under their original names because tests/flow-engine.test.ts
// imports them from this path, and that test is the regression net for the
// eighteen live flows.
export {
  matchesCondition,
  parseNumberFromReply,
  compareNumeric,
  evaluateCondition,
  interpolateTemplate,
  looksMultiField,
  isSkippableQuestion,
  parseExtraction,
  placeholdersIn,
} from './flow-nodes/pure';

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
//
// The second fast path used to be `/\bpagarbook\b/` — one client's product name,
// hard-coded into the engine every workspace runs. The term list is now the
// workspace's own, read from settings.flow_offtopic_terms, so a workspace with
// none set simply relies on the classifier.
async function isOffTopicReply(
  flowQuestion: string,
  userMessage: string,
  offTopicTerms: string[] = [],
): Promise<boolean> {
  const m = userMessage.trim().toLowerCase();

  // Fast path 1 — pure number or very short numeric reply → always an answer
  if (/^\d+$/.test(m) || (/\d/.test(m) && m.length < 20)) return false;

  // Fast path 2 — a term this workspace treats as always off-topic
  if (offTopicTerms.some((t) => t && m.includes(t.toLowerCase()))) return true;

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

// ── Lead export on handoff ────────────────────────────────────────────────────
// Posts the answers a flow collected to whatever the workspace has configured,
// which in practice is a Google Sheet via an Apps Script webhook.
//
// The payload used to be a fixed list of one client's field names —
// business_employee_count, attendance_method, calculator_person, demo_date and
// the rest. Every other workspace's flow therefore pushed a row of empty columns
// to its own sheet, however its questions were named.
//
// Now the payload is the flow's own variables: one column per question that
// saved an answer, named as the author named it. A workspace whose sheet expects
// the old VMS headers keeps getting them, because those are still what that
// workspace's questions are called.
async function notifyGoogleSheets(
  supabase: AdminClient,
  workspaceId: string,
  conversationId: string,
  contactPhone: string,
  context: FlowContext,
): Promise<void> {
  try {
    const { data: contactRow } = await (supabase as any)
      .from('contacts')
      .select('name')
      .eq('phone', contactPhone)
      .eq('workspace_id', workspaceId)
      .single();

    const payload: Record<string, string> = {
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      phone:     contactPhone,
      name:      (contactRow?.name as string | null) ?? '',
    };

    // `x_text` holds the raw reply and `x` its parsed number; the sheet wants
    // what the customer actually typed, so the text form wins and the numeric
    // twin is dropped rather than exported as a second mystery column.
    for (const [key, value] of Object.entries(context)) {
      if (!key.endsWith('_text')) continue;
      const name = key.slice(0, -'_text'.length);
      if (name.startsWith('system.')) continue;
      payload[name] = String(value ?? '');
    }

    await notifyWorkspaceSheets(supabase, workspaceId, 'sheets_webhook_url', payload);
    console.log(`[FlowEngine] Lead export sent for conversation ${conversationId}`);
  } catch (err) {
    console.error('[FlowEngine] Lead export failed:', err);
  }
}

// ── Sending ───────────────────────────────────────────────────────────────────
// A handler never touches the network or the database directly. It gets this
// facade, which sends and records in one call, so a message a customer received
// always appears in the conversation.
function makeSend(
  supabase: AdminClient,
  workspaceId: string,
  conversationId: string,
  phoneNumberId: string,
  accessToken: string,
  contactPhone: string,
): SendFacade {
  const send = (payload: Record<string, unknown>) =>
    sendWhatsAppMessage(phoneNumberId, accessToken, contactPhone, payload);

  return {
    async text(body) {
      const id = await sendWhatsAppText(phoneNumberId, accessToken, contactPhone, body);
      await saveOutboundMessage(supabase, workspaceId, conversationId, body, id);
    },
    async buttons(body, buttons, header, footer) {
      const id = await sendWhatsAppButtons(
        phoneNumberId, accessToken, contactPhone, body, buttons, header, footer,
      );
      await saveOutboundMessage(supabase, workspaceId, conversationId, body, id, 'interactive');
    },
    async media(kind: MediaKind, url, caption, filename) {
      const id = await send({
        type: kind,
        [kind]: {
          link: url,
          ...(caption && kind !== 'audio' ? { caption } : {}),
          ...(filename && kind === 'document' ? { filename } : {}),
        },
      });
      // The conversation shows the caption when there is one, so the thread reads
      // as the customer saw it rather than as a bare "[image]".
      const label = caption?.trim() || `[${kind}]`;
      await saveOutboundMessage(supabase, workspaceId, conversationId, label, id);
    },
    async location(latitude, longitude, name, address) {
      const id = await send({
        type: 'location',
        location: { latitude, longitude, ...(name ? { name } : {}), ...(address ? { address } : {}) },
      });
      const label = name ? `[Location: ${name}]` : '[Location]';
      await saveOutboundMessage(supabase, workspaceId, conversationId, label, id);
    },
    async list(body, buttonText, sections: ListSection[], header, footer) {
      const id = await send({
        type: 'interactive',
        interactive: {
          type: 'list',
          ...(header ? { header: { type: 'text', text: header } } : {}),
          body: { text: body },
          ...(footer ? { footer: { text: footer } } : {}),
          action: {
            button: buttonText.slice(0, 20),
            sections: sections.map((s, i) => ({
              title: (s.title ?? `Options ${i + 1}`).slice(0, 24),
              rows: s.rows.slice(0, 10).map((r) => ({
                id: r.id.slice(0, 200),
                title: r.title.slice(0, 24),
                ...(r.description ? { description: r.description.slice(0, 72) } : {}),
              })),
            })),
          },
        },
      });
      await saveOutboundMessage(supabase, workspaceId, conversationId, body, id, 'interactive');
    },
  };
}

// ── Side effects ──────────────────────────────────────────────────────────────
// Every operation is scoped to the running workspace here, so no node can reach
// another tenant's rows however its data was authored.
function makeOps(
  supabase: AdminClient,
  workspaceId: string,
  conversationId: string,
  sessionId: string,
  contactId: string | null,
  contactPhone: string,
): FlowOps {
  const db = supabase as any;

  const patchLead = async (patch: Record<string, unknown>) => {
    if (!contactId) return;
    await db.from('leads').update(patch)
      .eq('workspace_id', workspaceId).eq('contact_id', contactId);
  };

  const currentTags = async (): Promise<string[]> => {
    if (!contactId) return [];
    const { data } = await db.from('contacts').select('tags')
      .eq('id', contactId).eq('workspace_id', workspaceId).single();
    return ((data?.tags as string[] | null) ?? []).filter(Boolean);
  };

  return {
    async setConversationStatus(status) {
      await db.from('conversations').update({ status })
        .eq('id', conversationId).eq('workspace_id', workspaceId);
    },
    async addTags(tags) {
      if (!contactId || tags.length === 0) return;
      const merged = [...new Set([...(await currentTags()), ...tags])];
      await db.from('contacts').update({ tags: merged })
        .eq('id', contactId).eq('workspace_id', workspaceId);
    },
    async removeTags(tags) {
      if (!contactId || tags.length === 0) return;
      const drop = new Set(tags.map((t) => t.toLowerCase()));
      const kept = (await currentTags()).filter((t) => !drop.has(t.toLowerCase()));
      await db.from('contacts').update({ tags: kept })
        .eq('id', contactId).eq('workspace_id', workspaceId);
    },
    async setLeadTemperature(temperature) {
      // Only the label is set here. ai_score stays the classifier's to own, so a
      // flow cannot quietly outrank the scoring engine.
      await patchLead({ temperature });
    },
    async setContactField(field, value) {
      if (!contactId) return;
      // An arbitrary column name from node data must never reach the update, so
      // only the fields a flow has business setting are allowed through.
      const ALLOWED = new Set(['name', 'email', 'company', 'notes', 'city']);
      if (!ALLOWED.has(field)) {
        console.warn(`[FlowOps] refused to set contact field "${field}"`);
        return;
      }
      await db.from('contacts').update({ [field]: value })
        .eq('id', contactId).eq('workspace_id', workspaceId);
    },
    async assignTo(memberId) {
      await db.from('conversations').update({ assigned_to: memberId })
        .eq('id', conversationId).eq('workspace_id', workspaceId);
      await patchLead({ assigned_to: memberId });
    },
    async createTask(title, dueInHours, assigneeId) {
      if (!title) return;
      await db.from('tasks').insert({
        workspace_id: workspaceId,
        title,
        status: 'pending',
        ...(assigneeId ? { assigned_to: assigneeId } : {}),
        ...(contactId ? { contact_id: contactId } : {}),
        ...(dueInHours
          ? { due_date: new Date(Date.now() + dueInHours * 3600_000).toISOString() }
          : {}),
      });
    },
    async notifyTeam(message, channel) {
      if (!message) return;
      await db.from('notifications').insert({
        workspace_id: workspaceId,
        type: 'flow_action',
        title: 'Flow notification',
        message,
        meta: { channel, conversation_id: conversationId, phone: contactPhone },
      });
    },
    async optOut() {
      if (!contactId) return;
      await db.from('contacts').update({ opted_out: true })
        .eq('id', contactId).eq('workspace_id', workspaceId);
    },
    async schedule(atIso, handle) {
      await db.from('time_trigger_queue').insert({
        workspace_id:    workspaceId,
        conversation_id: conversationId,
        contact_id:      contactId,
        action_type:     'flow_resume',
        trigger_at:      atIso,
        status:          'pending',
        action_data:     { session_id: sessionId, handle },
      });
    },
    async cancelSchedules() {
      // A session may have several pending wake-ups — a question's timeout and a
      // wait it reached by another path. Whatever the customer does next, none of
      // them should fire against a node the session has left.
      await db.from('time_trigger_queue')
        .update({ status: 'cancelled' })
        .eq('workspace_id', workspaceId)
        .eq('action_type', 'flow_resume')
        .eq('status', 'pending')
        .filter('action_data->>session_id', 'eq', sessionId);
    },
  };
}

// ── The engine ────────────────────────────────────────────────────────────────
// Walks the flow. Each node's handler says what it did and where control goes;
// edge resolution, session advancement, variable merging and the step limit all
// live here, so a node type cannot forget one of them.
//
// A flow may legitimately loop — a menu the customer returns to — so the walk is
// bounded by steps rather than by visited nodes.
const MAX_STEPS_PER_TURN = 40;

interface RunOptions {
  /** Call the parked node's `resume` instead of `run` — a reply just arrived. */
  resuming?: boolean;
  /** The edge to take out of the parked node when a timer woke it. */
  wakeHandle?: string;
}

async function runFlowFrom(
  supabase: AdminClient,
  startNode: FlowNode,
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
  contactId: string | null,
  choice?: { id?: string; title?: string },
  options: RunOptions = {},
): Promise<boolean> {
  const send = makeSend(supabase, workspaceId, conversationId, phoneNumberId, accessToken, contactPhone);
  const ops  = makeOps(supabase, workspaceId, conversationId, sessionId, contactId, contactPhone);

  let node: FlowNode | null = startNode;
  // Date and time are refreshed every turn. A session parked for two days would
  // otherwise interpolate the day it started.
  let vars = { ...context, ...nowVars() };
  let resuming = options.resuming ?? false;

  for (let step = 0; step < MAX_STEPS_PER_TURN; step++) {
    if (!node) {
      await endSession(supabase, sessionId);
      return false;
    }

    const handler = handlerFor(node.type);
    if (!handler) {
      // A flow saved by a newer deploy can name a node this build cannot run.
      console.warn(`[FlowEngine] unknown node type "${node.type}" — ending session`);
      await endSession(supabase, sessionId);
      return false;
    }

    const ctx = {
      node,
      flow: { nodes, edges },
      incoming: incomingMessage,
      choice,
      vars,
      send,
      ops,
      workspaceId,
      conversationId,
      sessionId,
      contactId,
      contactPhone,
      interpolate: (text: string) => interpolateTemplate(text, vars),
    };

    let result: NodeResult;
    if (resuming) {
      resuming = false;
      result = handler.resume
        ? await handler.resume(ctx)
        : { outcome: { next: 'edge' } };
    } else if (options.wakeHandle && step === 0) {
      // A timer woke this node. It has already run; take the edge the timer names.
      result = { outcome: { next: 'edge', handle: options.wakeHandle } };
    } else {
      result = await handler.run(ctx);
    }

    if (result.setVars && Object.keys(result.setVars).length > 0) {
      vars = { ...vars, ...result.setVars };
      await (supabase as any).from('flow_sessions').update({ context: vars }).eq('id', sessionId);
    }

    const outcome = result.outcome;
    switch (outcome.next) {
      case 'wait': {
        await updateSession(supabase, sessionId, node.id);
        // Only now does the node's timeout start counting, and only if the
        // author set one. Before this, timeoutHours was collected and ignored.
        const hours = (node.data as { timeoutHours?: number } | null)?.timeoutHours;
        if (typeof hours === 'number' && hours > 0) {
          await ops.schedule(new Date(Date.now() + hours * 3600_000).toISOString(), 'timeout');
        }
        return true;
      }
      case 'sleep': {
        await updateSession(supabase, sessionId, node.id);
        return true;
      }
      case 'end': {
        await endSession(supabase, sessionId);
        return false;
      }
      case 'handoff': {
        await ops.setConversationStatus('pending');
        await ops.cancelSchedules();
        await endSession(supabase, sessionId);
        notifyGoogleSheets(supabase, workspaceId, conversationId, contactPhone, vars).catch(() => {});
        return false;
      }
      case 'goto': {
        node = nodes.find((n) => n.id === outcome.nodeId) ?? null;
        if (node) await updateSession(supabase, sessionId, node.id);
        break;
      }
      case 'edge': {
        node = findNextNode(nodes, edges, node.id, outcome.handle);
        if (node) await updateSession(supabase, sessionId, node.id);
        break;
      }
    }
  }

  // Past the step limit the flow is almost certainly cycling without waiting for
  // anyone. Ending the session is better than sending messages forever.
  console.error(`[FlowEngine] step limit hit in session ${sessionId} — ending`);
  await endSession(supabase, sessionId);
  return false;
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
// ── Built-in variables ────────────────────────────────────────────────────────
// A flow's context used to start empty, so the only thing a message could
// interpolate was an answer the flow had just asked for. That is why every live
// flow opens by asking for a name the platform already stores.
//
// These live under a `system.` prefix so they cannot collide with a variable an
// author named, and the lead export skips them.
function nowVars(): FlowContext {
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...opts }).format(new Date());
  return {
    'system.date': fmt({ day: '2-digit', month: 'short', year: 'numeric' }),
    'system.time': fmt({ hour: '2-digit', minute: '2-digit', hour12: true }),
    'system.weekday': fmt({ weekday: 'long' }),
  };
}

async function buildSystemVars(
  supabase: AdminClient,
  workspaceId: string,
  conversationId: string,
  contactPhone: string,
  lastReply: string,
): Promise<FlowContext> {
  const vars: FlowContext = {
    ...nowVars(),
    'system.phone': contactPhone,
    'system.last_reply': lastReply,
  };
  try {
    const db = supabase as any;
    const [{ data: ws }, { data: contact }] = await Promise.all([
      db.from('workspaces').select('name').eq('id', workspaceId).single(),
      db.from('contacts').select('id, name, tags').eq('phone', contactPhone)
        .eq('workspace_id', workspaceId).maybeSingle(),
    ]);
    if (ws?.name) vars['system.workspace_name'] = String(ws.name);
    if (contact?.name) vars['system.contact_name'] = String(contact.name);
    if (Array.isArray(contact?.tags)) vars['system.tags'] = contact.tags.join(', ');
    if (contact?.id) {
      const { data: lead } = await db.from('leads').select('temperature, source')
        .eq('workspace_id', workspaceId).eq('contact_id', contact.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (lead?.temperature) vars['system.lead_temperature'] = String(lead.temperature);
      if (lead?.source) vars['system.lead_source'] = String(lead.source);
    }
  } catch (err) {
    // A flow that starts without its built-ins is far better than one that does
    // not start. Unresolved placeholders render empty, as they always have.
    console.error('[FlowEngine] could not seed system variables:', err);
  }
  return vars;
}

// ── Per-workspace off-topic terms ─────────────────────────────────────────────
// Replaces a hard-coded product name in the shared classifier. Cached briefly so
// a flow reply does not cost an extra round trip on every message.
const OFF_TOPIC_TTL_MS = 60_000;
const offTopicCache = new Map<string, { terms: string[]; at: number }>();

async function workspaceOffTopicTerms(supabase: AdminClient, workspaceId: string): Promise<string[]> {
  const hit = offTopicCache.get(workspaceId);
  if (hit && Date.now() - hit.at < OFF_TOPIC_TTL_MS) return hit.terms;
  try {
    const { data } = await (supabase as any)
      .from('workspaces').select('settings').eq('id', workspaceId).single();
    const raw = (data?.settings as Record<string, unknown> | null)?.flow_offtopic_terms;
    const terms = Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string') : [];
    offTopicCache.set(workspaceId, { terms, at: Date.now() });
    return terms;
  } catch {
    offTopicCache.set(workspaceId, { terms: [], at: Date.now() });
    return [];
  }
}

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
  /**
   * The structured reply when the customer tapped a button or picked a list row.
   * The webhook stores the message text as a display label, so matching a tap
   * needs the id and title the tap itself carried.
   */
  choice?: { id?: string; title?: string },
  /**
   * Whether this is the contact's first message in 24 hours, which is what a
   * `first_message` trigger means. The webhook computes it before calling and
   * passes it through; omitted, this function works it out itself.
   */
  isFirstContactMessage?: boolean,
): Promise<FlowHandleResult> {
  try {
    // Check for active session
    const { data: session } = await (supabase as any)
      .from('flow_sessions')
      .select('*, chatbot_flows(*)')
      .eq('conversation_id', conversationId)
      .eq('workspace_id', workspaceId)
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

      // A sleeping flow is not advanced by a message. The wait node wakes on its
      // own timer; until then the bot answers normally, so a two-day follow-up
      // does not mean two days of silence.
      if (currentNode.type === 'wait') return false;

      let context: FlowContext = (session.context as FlowContext) ?? {};

      // Parked on a question: the reply is an answer unless it is plainly a
      // different question, in which case the AI answers first and the engine
      // re-asks. The session stays put either way, so no answer is lost.
      if (currentNode.type === 'question') {
        const qData = currentNode.data as QuestionNodeData;

        if (await isOffTopicReply(
          qData.message, messageContent, await workspaceOffTopicTerms(supabase, workspaceId),
        )) {
          // Interpolated, because the webhook sends this string straight back to
          // the customer. Unresolved, Fitness First re-asked "{{name}}! Which day
          // would you like to visit?" twice in one conversation.
          return { pendingQuestion: interpolateTemplate(qData.message, context) };
        }

        // A tap carries its own title; the stored message text is a display
        // label like `[Tapped button: "Book Now"]` and would be a poor answer.
        const answerText = (choice?.title ?? messageContent).trim();

        if (qData.saveAsVariable) {
          context = {
            ...context,
            // Numeric value for condition nodes
            [qData.saveAsVariable]:            parseNumberFromReply(answerText),
            // Raw text for the lead export and display
            [`${qData.saveAsVariable}_text`]:  answerText,
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

        // The reply cancels the question's timeout. Without this, a customer who
        // answers still gets the timeout branch hours later.
        await makeOps(
          supabase, workspaceId, conversationId, session.id as string, contactId, contactPhone,
        ).cancelSchedules();

        // Resuming starts at the parked node, not the next one: its handler
        // decides which branch the reply takes, which is how a tapped button
        // follows its own line instead of whichever edge was wired first.
        await runFlowFrom(
          supabase, currentNode, nodes, edges, workspaceId, conversationId,
          session.id as string, messageContent, phoneNumberId, accessToken, contactPhone,
          context, contactId, choice, { resuming: true },
        );
      } else if (currentNode.type === 'condition') {
        await runFlowFrom(
          supabase, currentNode, nodes, edges, workspaceId, conversationId,
          session.id as string, messageContent, phoneNumberId, accessToken, contactPhone,
          context, contactId, choice,
        );
      } else {
        // Not a node that waits for anyone. Advance one edge rather than re-run
        // it, so a message node cannot send its line twice.
        const next = findNextNode(nodes, edges, currentNodeId);
        if (next) {
          await updateSession(supabase, session.id as string, next.id);
          await runFlowFrom(
            supabase, next, nodes, edges, workspaceId, conversationId,
            session.id as string, messageContent, phoneNumberId, accessToken, contactPhone,
            context, contactId, choice,
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

    // "First message" is judged per-CONTACT, not per-conversation. Conversations
    // get auto-resolved after inactivity, so a customer who pauses a few minutes
    // lands in a brand-new conversation and a first_message flow re-fires — the
    // client saw the welcome menu re-sent three times inside one session.
    //
    // The webhook has already worked this out before calling here, so it passes
    // the answer in. Recomputing it cost two counts plus a lookup of the
    // contact_id the caller was already holding. The fallback below keeps this
    // function correct for any caller that cannot supply it.
    let isFirstMessage: boolean;
    if (typeof isFirstContactMessage === 'boolean') {
      isFirstMessage = isFirstContactMessage;
    } else {
      const { count: msgCount } = await (supabase as any)
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .eq('workspace_id', workspaceId)
        .eq('direction', 'inbound');

      isFirstMessage = (msgCount ?? 0) <= 1;
      if (isFirstMessage) {
        const { data: convRow } = await (supabase as any)
          .from('conversations')
          .select('contact_id')
          .eq('id', conversationId)
          .maybeSingle();
        const cid = convRow?.contact_id as string | undefined;
        if (cid) {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { count: recentInbound } = await (supabase as any)
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .eq('sender_id', cid)
            .eq('direction', 'inbound')
            .gte('created_at', since);
          if ((recentInbound ?? 0) > 1) isFirstMessage = false;
        }
      }
    }
    const lowerContent = messageContent.toLowerCase().trim();

    // Which flow wins used to be whichever the query returned first, which is
    // undefined — and four Razorveda flows are active at once. Highest priority
    // wins now, oldest breaking the tie, so the order is at least the author's.
    const ordered = [...(flows as ChatbotFlow[])].sort((a, b) => {
      const pa = (a as { priority?: number }).priority ?? 0;
      const pb = (b as { priority?: number }).priority ?? 0;
      if (pa !== pb) return pb - pa;
      return String(a.created_at).localeCompare(String(b.created_at));
    });

    let matchedFlow: ChatbotFlow | null = null;
    for (const flow of ordered) {
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

    // A flow used to start with an empty context, so it had no variable it had
    // not asked for — which is why every one of them opens by asking for a name
    // the platform already knows. The `system.` keys are seeded here.
    const seeded = await buildSystemVars(supabase, workspaceId, conversationId, contactPhone, messageContent);

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
        context:         seeded,
      })
      .select()
      .single();

    if (sessionError || !newSession) {
      console.error('[FlowEngine] Failed to create session:', sessionError?.message);
      return false;
    }

    await runFlowFrom(
      supabase, startNode, nodes, edges, workspaceId, conversationId,
      newSession.id as string, messageContent, phoneNumberId, accessToken, contactPhone,
      seeded, contactId, choice,
    );

    return true;
  } catch (err) {
    console.error('[FlowEngine] Error:', err);
    return false;
  }
}

// ── Waking a parked session ───────────────────────────────────────────────────
// Called by the time-triggers cron for a `flow_resume` row. Two things park a
// session with a wake-up: a wait node, which resumes down its only edge, and a
// question whose timeoutHours elapsed.
//
// `timeoutHours` was collected by the editor and read by nothing until this
// existed, so every "if they don't reply in 48 hours" branch an author drew was
// decoration.
export async function resumeFlowSession(
  supabase: AdminClient,
  sessionId: string,
  handle: string,
): Promise<boolean> {
  try {
    const db = supabase as any;
    const { data: session } = await db
      .from('flow_sessions')
      .select('*, chatbot_flows(*)')
      .eq('id', sessionId)
      .maybeSingle();

    // The customer replied, or a sweep expired it, or a handoff ended it. Either
    // way this wake-up is stale and must not send anything.
    if (!session || session.status !== 'active') return false;

    const flow = session.chatbot_flows as ChatbotFlow | null;
    if (!flow) return false;

    const nodes = (flow.nodes ?? []) as FlowNode[];
    const edges = (flow.edges ?? []) as FlowEdge[];
    const currentNodeId = session.current_node_id as string;
    const node = nodes.find((n) => n.id === currentNodeId);
    if (!node) {
      await endSession(supabase, sessionId);
      return false;
    }

    // A timeout with no branch drawn for it means the author never said what to
    // do with silence. Expiring is right; falling through to the node's ordinary
    // edge would treat silence as an answer.
    if (handle === 'timeout' && !edges.some((e) => e.source === node.id && e.sourceHandle === 'timeout')) {
      await db.from('flow_sessions')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', sessionId);
      return false;
    }

    const workspaceId = session.workspace_id as string;
    const { data: ws } = await db
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', workspaceId)
      .single();
    if (!ws?.phone_number_id || !ws?.access_token) return false;

    const { data: conv } = await db
      .from('conversations')
      .select('contact_id, contacts(phone)')
      .eq('id', session.conversation_id)
      .maybeSingle();
    const contactPhone = (conv?.contacts as { phone?: string } | null)?.phone;
    if (!contactPhone) return false;

    await runFlowFrom(
      supabase, node, nodes, edges, workspaceId,
      session.conversation_id as string, sessionId,
      '', // nothing was said; a timer brought us here
      ws.phone_number_id as string,
      String(ws.access_token).replace(/\ufeff/g, '').trim(),
      contactPhone,
      (session.context as FlowContext) ?? {},
      (session.contact_id as string | null) ?? null,
      undefined,
      { wakeHandle: handle },
    );
    return true;
  } catch (err) {
    console.error('[FlowEngine] resume failed for session', sessionId, err);
    return false;
  }
}
