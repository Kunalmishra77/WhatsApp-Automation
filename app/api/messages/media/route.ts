import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const maxDuration = 30;

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'image',
  'image/png':  'image',
  'image/webp': 'image',
  'image/gif':  'image',
  'video/mp4':  'video',
  'audio/mpeg': 'audio',
  'audio/ogg':  'audio',
  'audio/mp4':  'audio',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'text/plain': 'document',
};

// POST /api/messages/media  (multipart/form-data)
// Fields: file, conversationId, caption (optional)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const conversationId = formData.get('conversationId') as string | null;
    const caption = (formData.get('caption') as string | null)?.trim() ?? '';

    if (!file || !conversationId) {
      return NextResponse.json({ error: 'file and conversationId required' }, { status: 400 });
    }

    const mimeType = file.type;
    const mediaType = ALLOWED_TYPES[mimeType];
    if (!mediaType) {
      return NextResponse.json({ error: `Unsupported file type: ${mimeType}` }, { status: 400 });
    }

    // 16MB limit
    if (file.size > 16 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large — max 16MB' }, { status: 400 });
    }

    const db = createAdminClient() as any;

    const { data: conversation, error: convError } = await db
      .from('conversations')
      .select('id, workspace_id, contact_id, contacts(phone)')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const authz = await requireWorkspacePermission(conversation.workspace_id, 'handle_conversations');

    const { data: ws } = await db
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', conversation.workspace_id)
      .single();

    if (!ws?.phone_number_id || !ws?.access_token) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });
    }

    const token = (ws.access_token as string).replace(/﻿/g, '').trim();
    const phoneNumberId = ws.phone_number_id as string;
    const contactPhone = (conversation.contacts as { phone?: string } | null)?.phone;

    if (!contactPhone) {
      return NextResponse.json({ error: 'Contact has no phone number' }, { status: 400 });
    }

    // Step 1: Upload media to WhatsApp
    const uploadForm = new FormData();
    uploadForm.append('messaging_product', 'whatsapp');
    uploadForm.append('file', file, file.name);
    uploadForm.append('type', mimeType);

    const uploadRes = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: uploadForm,
      },
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.json() as { error?: { message?: string } };
      console.error('[Media] Upload error:', err);
      return NextResponse.json({ error: err?.error?.message ?? 'Media upload failed' }, { status: 400 });
    }

    const uploadData = await uploadRes.json() as { id?: string };
    const mediaId = uploadData.id;
    if (!mediaId) return NextResponse.json({ error: 'No media ID returned' }, { status: 500 });

    // Step 2: Send WhatsApp message with media_id
    const messageBody: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: contactPhone,
      type: mediaType,
    };

    if (mediaType === 'image') {
      messageBody.image = { id: mediaId, caption: caption || undefined };
    } else if (mediaType === 'video') {
      messageBody.video = { id: mediaId, caption: caption || undefined };
    } else if (mediaType === 'audio') {
      messageBody.audio = { id: mediaId };
    } else {
      messageBody.document = { id: mediaId, filename: file.name, caption: caption || undefined };
    }

    const sendRes = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(messageBody),
      },
    );

    const sendData = await sendRes.json() as { messages?: Array<{ id?: string }>; error?: { message?: string } };
    if (!sendRes.ok) {
      return NextResponse.json({ error: sendData?.error?.message ?? 'Send failed' }, { status: sendRes.status });
    }

    const waMessageId = sendData?.messages?.[0]?.id ?? null;

    // Step 3: Save to DB
    await db.from('messages').insert({
      conversation_id: conversationId,
      workspace_id:    conversation.workspace_id,
      whatsapp_msg_id: waMessageId,
      sender_type:     'agent',
      sender_id:       authz.userId,
      direction:       'outbound',
      type:            mediaType,
      content:         caption || file.name,
      status:          'sent',
      media_filename:  file.name,
      caption:         caption || null,
      metadata:        { media_id: mediaId, mime_type: mimeType },
    });

    await db.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);

    return NextResponse.json({ success: true, mediaId, waMessageId });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Media] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
