import { createAdminClient } from '@/services/supabase/admin';
import type { FlowNode, FlowEdge, ChatbotFlow } from '@/modules/flows/types';

type AdminClient = ReturnType<typeof createAdminClient>;

async function sendWhatsAppText(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  text: string,
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
        type: 'text',
        text: { preview_url: false, body: text },
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

async function saveOutboundMessage(
  supabase: AdminClient,
  workspaceId: string,
  conversationId: string,
  text: string,
  waMessageId: string | null,
) {
  const now = new Date().toISOString();
  await (supabase as any).from('messages').insert({
    conversation_id: conversationId,
    workspace_id:    workspaceId,
    sender_type:     'bot',
    sender_id:       null,
    direction:       'outbound',
    type:            'text',
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
        sessionId, incomingMessage, phoneNumberId, accessToken, contactPhone,
      );
    }

    case 'message': {
      const d = node.data as { message: string };
      if (d.message) {
        const waId = await sendWhatsAppText(phoneNumberId, accessToken, contactPhone, d.message);
        await saveOutboundMessage(supabase, workspaceId, conversationId, d.message, waId);
      }
      const next = findNextNode(nodes, edges, node.id);
      if (!next) {
        await endSession(supabase, sessionId);
        return false;
      }
      await updateSession(supabase, sessionId, next.id);
      return executeNode(
        supabase, next, nodes, edges, workspaceId, conversationId,
        sessionId, incomingMessage, phoneNumberId, accessToken, contactPhone,
      );
    }

    case 'question': {
      const d = node.data as { message: string };
      if (d.message) {
        const waId = await sendWhatsAppText(phoneNumberId, accessToken, contactPhone, d.message);
        await saveOutboundMessage(supabase, workspaceId, conversationId, d.message, waId);
      }
      // Wait for reply — session stays on this node
      await updateSession(supabase, sessionId, node.id);
      return true;
    }

    case 'condition': {
      const d = node.data as { keyword: string; matchType: 'contains' | 'equals' | 'starts_with' };
      const matched = matchesCondition(incomingMessage, d.keyword, d.matchType);
      const handleId = matched ? 'yes' : 'no';
      const next = findNextNode(nodes, edges, node.id, handleId);
      if (!next) {
        await endSession(supabase, sessionId);
        return false;
      }
      await updateSession(supabase, sessionId, next.id);
      return executeNode(
        supabase, next, nodes, edges, workspaceId, conversationId,
        sessionId, incomingMessage, phoneNumberId, accessToken, contactPhone,
      );
    }

    case 'assign_agent': {
      const d = node.data as { message: string };
      if (d.message) {
        const waId = await sendWhatsAppText(phoneNumberId, accessToken, contactPhone, d.message);
        await saveOutboundMessage(supabase, workspaceId, conversationId, d.message, waId);
      }
      // Set conversation to pending (human handoff)
      await (supabase as any).from('conversations').update({ status: 'pending' }).eq('id', conversationId);
      await endSession(supabase, sessionId);
      return false;
    }

    case 'end': {
      const d = node.data as { message: string };
      if (d.message) {
        const waId = await sendWhatsAppText(phoneNumberId, accessToken, contactPhone, d.message);
        await saveOutboundMessage(supabase, workspaceId, conversationId, d.message, waId);
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

export async function processFlowForMessage(
  supabase: AdminClient,
  workspaceId: string,
  conversationId: string,
  contactId: string,
  messageContent: string,
  phoneNumberId: string,
  accessToken: string,
  contactPhone: string,
): Promise<boolean> {
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
      newSession.id as string, messageContent, phoneNumberId, accessToken, contactPhone,
    );

    return true;
  } catch (err) {
    console.error('[FlowEngine] Error:', err);
    return false;
  }
}
