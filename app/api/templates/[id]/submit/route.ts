import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { authzResponse, requireWorkspacePermission } from '@/lib/authz';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: templateId } = await params;

    const supabase = await createClient();
    const admin = createAdminClient();
    const adminDb = admin as any;

    const { data: template, error: templateError } = await adminDb
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    await requireWorkspacePermission(template.workspace_id, 'manage_templates');

    const { data: workspace } = await adminDb
      .from('workspaces')
      .select('waba_id, access_token')
      .eq('id', template.workspace_id)
      .single();

    // Fall back to env vars if workspace DB fields are not yet populated
    const wabaId      = workspace?.waba_id      ?? process.env.WHATSAPP_WABA_ID;
    const accessToken = workspace?.access_token ?? process.env.WHATSAPP_ACCESS_TOKEN;

    if (!wabaId || !accessToken) {
      return NextResponse.json(
        { error: 'Missing WABA ID or access token. Set WHATSAPP_WABA_ID and WHATSAPP_ACCESS_TOKEN in env.' },
        { status: 400 },
      );
    }

    const components: Array<Record<string, unknown>> = [];

    const headerType = (template.header_type as string | null)?.toUpperCase() ?? 'TEXT';
    if (template.header_content && (!template.header_type || headerType === 'TEXT')) {
      components.push({ type: 'HEADER', format: 'TEXT', text: template.header_content });
    } else if (template.header_content && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
      // Media header — header_content stores the WhatsApp media handle uploaded as example
      components.push({
        type:    'HEADER',
        format:  headerType,
        example: { header_handle: [template.header_content] },
      });
    }

    // Build example values for variables — Meta requires this to avoid auto-rejection
    const variables: string[] = Array.isArray(template.variables) ? template.variables : [];
    const exampleValues = variables.map((_: string, i: number) => {
      const samples = ['John', '+919876543210', 'REF123456', 'V4TOU Tech', '24 hours'];
      return samples[i] ?? `Sample${i + 1}`;
    });

    const bodyComponent: Record<string, unknown> = { type: 'BODY', text: template.body };
    if (exampleValues.length > 0) {
      bodyComponent.example = { body_text: [exampleValues] };
    }
    components.push(bodyComponent);

    if (template.footer) {
      components.push({ type: 'FOOTER', text: template.footer });
    }

    if (template.buttons && Array.isArray(template.buttons) && template.buttons.length > 0) {
      interface TBtn { type: string; text: string; value?: string; }
      const metaButtons = (template.buttons as TBtn[]).map((b) => {
        if (b.type === 'URL')          return { type: 'URL',          text: b.text, url:          b.value ?? '' };
        if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.value ?? '' };
        return { type: 'QUICK_REPLY', text: b.text };
      });
      components.push({ type: 'BUTTONS', buttons: metaButtons });
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v19.0/${wabaId}/message_templates`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.replace(/﻿/g, '').trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name:       template.name,
          language:   template.language,
          category:   template.category.toUpperCase(),
          components,
        }),
      },
    );

    const metaData = await metaRes.json() as {
      id?: string;
      status?: string;
      error?: { message?: string; error_user_msg?: string };
    };

    if (!metaRes.ok) {
      const errMsg = metaData?.error?.error_user_msg ?? metaData?.error?.message ?? 'Meta API error';
      console.error('[TemplateSubmit] Meta error:', JSON.stringify(metaData));
      console.error('[TemplateSubmit] WABA ID used:', wabaId);
      console.error('[TemplateSubmit] Template payload:', JSON.stringify({ name: template.name, language: template.language, category: template.category.toUpperCase(), components }));
      return NextResponse.json({ error: errMsg, details: metaData }, { status: 502 });
    }

    const metaStatus = (metaData.status ?? 'PENDING').toLowerCase() as 'pending' | 'approved' | 'rejected';

    await adminDb
      .from('templates')
      .update({
        status:      metaStatus,
        updated_at:  new Date().toISOString(),
      })
      .eq('id', templateId);

    return NextResponse.json({
      success:    true,
      metaId:     metaData.id,
      metaStatus: metaData.status,
    });
  } catch (error) {
    if (error instanceof Error && error.message !== 'Internal server error') {
      return authzResponse(error);
    }
    console.error('[TemplateSubmit] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
