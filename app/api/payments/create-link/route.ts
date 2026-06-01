import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

interface RazorpayPaymentLinkResponse {
  id?: string;
  short_url?: string;
  error?: {
    code: string;
    description: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      conversationId?: string;
      amount?: number;
      currency?: string;
      description?: string;
    };

    if (!body.conversationId || !body.amount || !body.description) {
      return NextResponse.json({ error: 'conversationId, amount, and description are required' }, { status: 400 });
    }

    const db = createAdminClient() as any;

    // 1. Get conversation → workspace + contact phone
    const { data: conversation, error: convError } = await db
      .from('conversations')
      .select('id, workspace_id, contacts(id, phone, name)')
      .eq('id', body.conversationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 2. Permission check
    const authz = await requireWorkspacePermission(conversation.workspace_id, 'handle_conversations');

    // 3. Get workspace settings for Razorpay keys + WhatsApp creds
    const { data: workspace, error: wsError } = await db
      .from('workspaces')
      .select('settings, phone_number_id, access_token')
      .eq('id', conversation.workspace_id)
      .single();

    if (wsError || !workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const settings = (workspace.settings ?? {}) as Record<string, unknown>;
    const keyId = settings.razorpay_key_id as string | undefined;
    const keySecret = settings.razorpay_key_secret as string | undefined;

    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay not configured. Add API keys in Settings > Integrations.' }, { status: 400 });
    }

    // 4. Call Razorpay API to create payment link
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const razorRes = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(body.amount * 100), // paise
        currency: body.currency ?? 'INR',
        description: body.description,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/payment-success`,
        callback_method: 'get',
      }),
    });

    const razorData = await razorRes.json() as RazorpayPaymentLinkResponse;

    if (!razorRes.ok || !razorData.short_url) {
      console.error('[Payments] Razorpay error:', razorData);
      return NextResponse.json(
        { error: razorData.error?.description ?? 'Failed to create payment link' },
        { status: 502 },
      );
    }

    const paymentUrl = razorData.short_url;
    const contact = conversation.contacts as { id: string; phone: string; name: string | null } | null;

    // 5. Send WhatsApp message with payment link
    if (workspace.phone_number_id && workspace.access_token && contact?.phone) {
      const messageBody = `💳 Payment Request\n\n${body.description}\n\nAmount: ${body.currency ?? 'INR'} ${body.amount.toLocaleString()}\n\nPay here: ${paymentUrl}`;

      try {
        await fetch(
          `https://graph.facebook.com/v19.0/${workspace.phone_number_id}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${(workspace.access_token as string).replace(/﻿/g, '').trim()}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: contact.phone,
              type: 'text',
              text: { preview_url: true, body: messageBody },
            }),
          },
        );
      } catch (waErr) {
        console.error('[Payments] WhatsApp send error:', waErr);
        // Non-fatal — payment link still created
      }

      // 6. Save message to DB
      await db.from('messages').insert({
        conversation_id: body.conversationId,
        workspace_id:    conversation.workspace_id,
        sender_id:       authz.userId,
        sender_type:     'agent',
        direction:       'outbound',
        type:            'text',
        content:         `Payment link sent: ${paymentUrl} — ${body.description} (${body.currency ?? 'INR'} ${body.amount})`,
        status:          'sent',
        metadata:        {
          payment_link: paymentUrl,
          razorpay_id:  razorData.id,
          amount:       body.amount,
          currency:     body.currency ?? 'INR',
        },
      });
    }

    return NextResponse.json({ success: true, paymentUrl });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Payments] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
