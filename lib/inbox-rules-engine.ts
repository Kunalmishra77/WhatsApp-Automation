import { createAdminClient } from '@/services/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface RuleAction {
  type: 'label' | 'assign' | 'status' | 'auto_reply' | 'tag_contact';
  value: string;
}

export interface InboxRule {
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: 'keyword' | 'first_message' | 'any_message';
  trigger_value: {
    keywords?: string[];
    match?: 'any' | 'all';
  };
  actions: RuleAction[];
  priority: number;
}

function matchesTrigger(
  rule: InboxRule,
  messageContent: string,
  isFirstMessage: boolean,
): boolean {
  switch (rule.trigger_type) {
    case 'any_message':
      return true;

    case 'first_message':
      return isFirstMessage;

    case 'keyword': {
      const keywords = rule.trigger_value.keywords ?? [];
      if (keywords.length === 0) return false;
      const lower = messageContent.toLowerCase();
      const matchType = rule.trigger_value.match ?? 'any';
      if (matchType === 'all') {
        return keywords.every((kw) => lower.includes(kw.toLowerCase()));
      }
      return keywords.some((kw) => lower.includes(kw.toLowerCase()));
    }

    default:
      return false;
  }
}

async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  toPhone: string,
  body: string,
): Promise<string | null> {
  try {
    const response = await fetch(
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

    if (!response.ok) {
      console.error('[InboxRules] WhatsApp API error:', await response.text());
      return null;
    }

    const data = await response.json() as { messages?: Array<{ id?: string }> };
    return data?.messages?.[0]?.id ?? null;
  } catch (err) {
    console.error('[InboxRules] sendWhatsAppMessage failed:', err);
    return null;
  }
}

async function executeAction(
  supabase: AdminClient,
  action: RuleAction,
  conversationId: string,
  contactId: string,
  workspaceId: string,
  phoneNumberId: string,
  accessToken: string,
): Promise<void> {
  const db = supabase as any;

  switch (action.type) {
    case 'label': {
      await db.rpc('append_conversation_label', {
        p_conversation_id: conversationId,
        p_label: action.value,
      });
      break;
    }

    case 'assign': {
      await db
        .from('conversations')
        .update({ assigned_agent_id: action.value, status: 'assigned' })
        .eq('id', conversationId);
      break;
    }

    case 'status': {
      await db
        .from('conversations')
        .update({ status: action.value })
        .eq('id', conversationId);
      break;
    }

    case 'auto_reply': {
      const { data: contact, error: contactError } = await db
        .from('contacts')
        .select('phone')
        .eq('id', contactId)
        .single();

      if (contactError || !contact?.phone) {
        console.error('[InboxRules] Cannot find contact phone for auto_reply');
        break;
      }

      const waMessageId = await sendWhatsAppMessage(
        phoneNumberId,
        accessToken,
        contact.phone as string,
        action.value,
      );

      const now = new Date().toISOString();

      await db.from('messages').insert({
        conversation_id: conversationId,
        workspace_id: workspaceId,
        sender_type: 'bot',
        sender_id: null,
        direction: 'outbound',
        type: 'text',
        content: action.value,
        status: 'sent',
        whatsapp_msg_id: waMessageId,
        created_at: now,
      });

      await db
        .from('conversations')
        .update({ last_message: action.value, last_message_at: now })
        .eq('id', conversationId);

      break;
    }

    case 'tag_contact': {
      await db.rpc('append_contact_tag', {
        p_contact_id: contactId,
        p_tag: action.value,
      });
      break;
    }

    default:
      console.warn('[InboxRules] Unknown action type:', (action as RuleAction).type);
  }
}

export async function applyInboxRules(
  supabase: AdminClient,
  workspaceId: string,
  messageContent: string,
  conversationId: string,
  contactId: string,
  isFirstMessage: boolean,
  phoneNumberId: string,
  accessToken: string,
): Promise<void> {
  const db = supabase as any;

  const { data: rules, error } = await db
    .from('inbox_rules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (error) {
    console.error('[InboxRules] Failed to fetch rules:', error.message);
    return;
  }

  if (!rules || rules.length === 0) return;

  for (const rule of rules as InboxRule[]) {
    const matched = matchesTrigger(rule, messageContent, isFirstMessage);

    if (!matched) continue;

    console.log(`[InboxRules] Rule "${rule.name}" matched — executing ${rule.actions.length} action(s)`);

    for (const action of rule.actions) {
      try {
        await executeAction(
          supabase,
          action,
          conversationId,
          contactId,
          workspaceId,
          phoneNumberId,
          accessToken,
        );
        console.log(`[InboxRules]   action ${action.type}="${action.value}" executed`);
      } catch (err) {
        console.error(`[InboxRules]   action ${action.type} failed:`, err);
      }
    }
  }
}
