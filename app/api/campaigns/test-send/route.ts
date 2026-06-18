import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { normalizePhone } from '@/lib/phone';

// POST /api/campaigns/test-send
// Sends a single test message using the selected template to a specific phone number.
// Used in the campaign wizard's review step before launching.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, templateId, toPhone, mediaId, mediaType } = await request.json() as {
      workspaceId?: string;
      templateId?:  string;
      toPhone?:     string;
      mediaId?:     string;
      mediaType?:   string;
    };

    if (!workspaceId || !templateId || !toPhone) {
      return NextResponse.json({ error: 'workspaceId, templateId, toPhone required' }, { status: 400 });
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

    // Fetch template
    const { data: template } = await db
      .from('templates')
      .select('name, language, header_type')
      .eq('id', templateId)
      .single();

    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    const phone = normalizePhone(toPhone);
    if (!phone) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });

    const accessToken = (workspace.access_token as string).replace(/﻿/g, '').trim();
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
      `https://graph.facebook.com/v19.0/${workspace.phone_number_id}/messages`,
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
