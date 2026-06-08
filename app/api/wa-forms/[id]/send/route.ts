import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/wa-forms/[id]/send  — start a form session for a conversation
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: formId } = await params;
    const { conversationId } = await request.json() as { conversationId: string };
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

    const db = createAdminClient() as any;

    const { data: form } = await db.from('wa_forms').select('*').eq('id', formId).single();
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    if (!form.is_active) return NextResponse.json({ error: 'Form is inactive' }, { status: 400 });

    await requireWorkspacePermission(form.workspace_id as string, 'handle_conversations');

    const { data: conversation } = await db
      .from('conversations')
      .select('id, contact_id, contacts(phone, name), workspace_id')
      .eq('id', conversationId)
      .single();

    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    // Check for existing active session
    const { data: existing } = await db
      .from('wa_form_sessions')
      .select('id')
      .eq('form_id', formId)
      .eq('conversation_id', conversationId)
      .eq('status', 'active')
      .maybeSingle();
    if (existing) return NextResponse.json({ error: 'Form already active for this conversation' }, { status: 409 });

    // Create session
    const { data: session, error: sesErr } = await db.from('wa_form_sessions').insert({
      form_id:         formId,
      workspace_id:    form.workspace_id,
      conversation_id: conversationId,
      contact_id:      conversation.contact_id,
    }).select().single();
    if (sesErr) throw sesErr;

    // Get workspace credentials to send first question
    const { data: ws } = await db
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', form.workspace_id)
      .single();

    const questions = form.questions as Array<{ id: string; text: string; type: string; options?: string[] }>;
    const first = questions[0];
    if (!first || !ws?.phone_number_id || !ws?.access_token) {
      return NextResponse.json({ session, started: false });
    }

    const phone = (conversation.contacts as any)?.phone as string;
    const token = (ws.access_token as string).replace(/﻿/g, '').trim();

    // Send first question
    await sendFormQuestion(ws.phone_number_id as string, token, phone, first, 0, questions.length);

    return NextResponse.json({ session, started: true });
  } catch (e) {
    if (e instanceof AuthzError) return authzResponse(e);
    console.error('[WA Forms send]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function sendFormQuestion(
  phoneNumberId: string,
  token: string,
  toPhone: string,
  question: { id: string; text: string; type: string; options?: string[] },
  idx: number,
  total: number,
) {
  const prefix = `*Question ${idx + 1}/${total}*\n`;
  const token_ = token.replace(/﻿/g, '').trim();

  if (question.type === 'choice' && question.options && question.options.length <= 3) {
    // Send as button message
    await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token_}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: prefix + question.text },
          action: {
            buttons: question.options.slice(0, 3).map((opt, i) => ({
              type: 'reply',
              reply: { id: `form_opt_${i}`, title: opt.slice(0, 20) },
            })),
          },
        },
      }),
    });
  } else if (question.type === 'choice' && question.options && question.options.length > 3) {
    // Send as list message
    await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token_}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: prefix + question.text },
          action: {
            button: 'Choose an option',
            sections: [{
              title: 'Options',
              rows: question.options.slice(0, 10).map((opt, i) => ({
                id: `form_opt_${i}`,
                title: opt.slice(0, 24),
              })),
            }],
          },
        },
      }),
    });
  } else {
    // Plain text question
    await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token_}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { preview_url: false, body: prefix + question.text },
      }),
    });
  }
}
