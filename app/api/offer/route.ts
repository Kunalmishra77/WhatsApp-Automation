import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { invalidateWorkspace } from '@/lib/workspace-cache';
import { validateOfferInput, findConflictingAmounts } from '@/lib/offer';
import type { Json } from '@/types/database.types';

// PUT /api/offer  Body: { workspaceId, name, details, valid_from?, valid_until? }
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as { workspaceId?: string } & Record<string, unknown>;
    const workspaceId = body.workspaceId;
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const parsed = validateOfferInput(body as Record<string, unknown>);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const db = createAdminClient() as any;
    const { data: existing } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    const settings = (existing?.settings ?? {}) as Record<string, unknown>;

    const active_offer = { ...parsed.offer, updated_at: new Date().toISOString(), lapse_notified: false };
    const nextSettings = { ...settings, active_offer } as Json;

    const { error } = await db.from('workspaces')
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq('id', workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await invalidateWorkspace({ id: workspaceId });

    // Conflict scan: gather KB + uploaded-doc + persona text, warn about non-offer amounts.
    const sources: string[] = [];
    const persona = settings.agent_persona;
    if (typeof persona === 'string') sources.push(persona);
    const { data: kb } = await db.from('knowledge_base').select('content').eq('workspace_id', workspaceId).eq('is_active', true).limit(200);
    for (const r of (kb ?? []) as Array<{ content: string }>) sources.push(r.content);
    const { data: docs } = await db.from('vector_documents').select('content').eq('workspace_id', workspaceId).limit(300);
    for (const r of (docs ?? []) as Array<{ content: string }>) sources.push(r.content);

    const warnings = findConflictingAmounts(parsed.offer.details, sources);
    return NextResponse.json({ ok: true, warnings });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Offer PUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/offer?workspaceId=...  → clears the active offer.
export async function DELETE(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: existing } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    const settings = { ...((existing?.settings ?? {}) as Record<string, unknown>) };
    delete settings.active_offer;

    const { error } = await db.from('workspaces')
      .update({ settings: settings as Json, updated_at: new Date().toISOString() })
      .eq('id', workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await invalidateWorkspace({ id: workspaceId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Offer DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
