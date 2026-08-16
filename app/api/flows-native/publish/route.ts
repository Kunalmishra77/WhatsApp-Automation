import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { AuthzError, authzResponse, requireWorkspacePermission } from '@/lib/authz';
import { NATIVE_FLOW_TEMPLATES } from '@/lib/native-flows';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { workspaceId, templateKey } = await request.json() as {
      workspaceId?: string;
      templateKey?: string;
    };

    const template = templateKey ? NATIVE_FLOW_TEMPLATES[templateKey] : undefined;

    if (!workspaceId || !template) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'create_campaigns');

    const db = createAdminClient() as any;

    const { data: ws, error: wsError } = await db
      .from('workspaces')
      .select('access_token, waba_id, settings')
      .eq('id', workspaceId)
      .single();

    if (wsError || !ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 400 });
    }

    const wabaId: string | null = ws.waba_id ?? (ws.settings as Record<string, unknown> | null)?.waba_id as string | undefined ?? null;

    if (!wabaId) {
      return NextResponse.json({ error: 'WhatsApp Business Account (WABA) id not configured for this workspace' }, { status: 400 });
    }

    if (!ws.access_token) {
      return NextResponse.json({ error: 'WhatsApp access token not configured for this workspace' }, { status: 400 });
    }

    const token = ws.access_token.replace(/﻿/g, '').trim();

    // ── Idempotency: already published? ─────────────────────────────────
    const { data: existing } = await db
      .from('flows_meta')
      .select('meta_flow_id, status')
      .eq('workspace_id', workspaceId)
      .eq('template_key', templateKey)
      .single();

    if (existing?.status === 'published' && existing.meta_flow_id) {
      return NextResponse.json({ ok: true, meta_flow_id: existing.meta_flow_id, status: 'published' });
    }

    // ── 1. Create the Flow ───────────────────────────────────────────────
    const createRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/flows`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${template.name} — ${workspaceId.slice(0, 8)}`,
        categories: ['LEAD_GENERATION'],
      }),
    });

    const createData = await createRes.json();
    const flowId = createData?.id;

    if (!createRes.ok || !flowId) {
      console.error('[FlowsNative/Publish] Graph create error:', createData);
      return NextResponse.json({ error: createData?.error?.message ?? 'Failed to create flow', details: createData }, { status: 502 });
    }

    // ── 2. Upload the Flow JSON asset ────────────────────────────────────
    const form = new FormData();
    form.append('asset_type', 'FLOW_JSON');
    form.append('name', 'flow.json');
    const blob = new Blob([JSON.stringify(template.buildJson())], { type: 'application/json' });
    form.append('file', blob, 'flow.json');

    const assetRes = await fetch(`https://graph.facebook.com/v19.0/${flowId}/assets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });

    const assetData = await assetRes.json();

    if (!assetRes.ok || assetData?.validation_errors?.length) {
      console.error('[FlowsNative/Publish] Graph asset upload error:', assetData);
      return NextResponse.json({ error: 'Flow JSON validation failed', details: assetData.validation_errors ?? assetData }, { status: 502 });
    }

    // ── 3. Publish the Flow ──────────────────────────────────────────────
    const publishRes = await fetch(`https://graph.facebook.com/v19.0/${flowId}/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const publishData = await publishRes.json();

    if (!publishRes.ok) {
      console.error('[FlowsNative/Publish] Graph publish error:', publishData);
      return NextResponse.json({ error: publishData?.error?.message ?? 'Failed to publish flow', details: publishData }, { status: 502 });
    }

    // ── 4. Record it ─────────────────────────────────────────────────────
    await db
      .from('flows_meta')
      .upsert(
        {
          workspace_id: workspaceId,
          template_key: templateKey,
          meta_flow_id: flowId,
          name: template.name,
          status: 'published',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,template_key' },
      );

    return NextResponse.json({ ok: true, meta_flow_id: flowId, status: 'published' });
  } catch (error) {
    if (error instanceof AuthzError) {
      return authzResponse(error);
    }

    console.error('[FlowsNative/Publish] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
