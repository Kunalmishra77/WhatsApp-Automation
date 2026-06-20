import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { normalizePhone } from '@/lib/phone';

// POST /api/campaigns/test-send
// Sends a single test message to a specific phone number.
// Supports both template campaigns and media-only campaigns (no template).
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, templateId, toPhone, mediaId, mediaType, mediaCaption } = await request.json() as {
      workspaceId?:  string;
      templateId?:   string;
      toPhone?:      string;
      mediaId?:      string;
      mediaType?:    string;
      mediaCaption?: string;
    };

    if (!workspaceId || !toPhone) {
      return NextResponse.json({ error: 'workspaceId and toPhone required' }, { status: 400 });
    }
    if (!templateId && !mediaId) {
      return NextResponse.json({ error: 'templateId or mediaId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'create_campaigns');

    const db = createAdminClient() as any;

    // Fetch workspace credentials
    const { data: workspace } = await db
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', workspaceId)
      .single();

    if (!workspace?.phone_number_id || !workspace?.access_token) {
      return NextResponse.json({ error: 'WhatsApp not configured for this workspace' }, { status: 400 });
    }

    const phone = normalizePhone(toPhone);
    if (!phone) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });

    const accessToken = (workspace.access_token as string).replace(/﻿/g, '').trim();

    // ── Media-only campaign (no template) ────────────────────────────────────
    if (!templateId && mediaId && mediaType) {
      const mType = mediaType.toLowerCase();
      const isUrl = mediaId.startsWith('http://') || mediaId.startsWith('https://');
      const mediaPayload: Record<string, string> = isUrl ? { link: mediaId } : { id: mediaId };
      if (mediaCaption?.trim() && mType !== 'document') {
        mediaPayload.caption = mediaCaption.trim();
      }

      const res = await fetch(
        `https://graph.facebook.com/v19.0/${workspace.phone_number_id as string}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: mType,
            [mType]: mediaPayload,
          }),
        },
      );

      const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string } };
      if (!res.ok) {
        return NextResponse.json({ error: data?.error?.message ?? 'WhatsApp API error' }, { status: 400 });
      }
      return NextResponse.json({ ok: true, messageId: data?.messages?.[0]?.id });
    }

    // ── Template campaign ─────────────────────────────────────────────────────
    const { data: template } = await db
      .from('templates')
      .select('name, language, header_type')
      .eq('id', templateId)
      .single();

    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    const components: Array<Record<string, unknown>> = [];

    // Include media header if provided
    if (mediaId && mediaType) {
      const tmplHeaderType = template.header_type?.toUpperCase();
      if (tmplHeaderType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(tmplHeaderType)) {
        const isUrl = mediaId.startsWith('http://') || mediaId.startsWith('https://');
        components.push({
          type: 'header',
          parameters: [{
            type: tmplHeaderType.toLowerCase(),
            [tmplHeaderType.toLowerCase()]: isUrl ? { link: mediaId } : { id: mediaId },
          }],
        });
      }
    }

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${workspace.phone_number_id as string}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name:     template.name,
            language: { code: template.language ?? 'en' },
            ...(components.length > 0 ? { components } : {}),
          },
        }),
      },
    );

    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string } };

    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message ?? 'WhatsApp API error' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, messageId: data?.messages?.[0]?.id });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Test Send]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
