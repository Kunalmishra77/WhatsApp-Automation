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

    const { data: workspace, error: wsError } = await adminDb
      .from('workspaces')
      .select('waba_id, access_token')
      .eq('id', template.workspace_id)
      .single();

    if (wsError || !workspace?.waba_id || !workspace?.access_token) {
      return NextResponse.json(
        { error: 'Workspace missing WABA ID or access token. Set these in workspace settings.' },
        { status: 400 },
      );
    }

    const components: Array<Record<string, unknown>> = [];

    if (template.header_content) {
      components.push({ type: 'HEADER', format: 'TEXT', text: template.header_content });
    }

    components.push({ type: 'BODY', text: template.body });

    if (template.footer) {
      components.push({ type: 'FOOTER', text: template.footer });
    }

    if (template.buttons && Array.isArray(template.buttons) && template.buttons.length > 0) {
      components.push({ type: 'BUTTONS', buttons: template.buttons });
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/v19.0/${workspace.waba_id}/message_templates`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${workspace.access_token.replace(/﻿/g, '').trim()}`,
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
      console.error('[TemplateSubmit] Meta error:', metaData);
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
