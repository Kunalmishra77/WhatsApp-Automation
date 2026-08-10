import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { syncWorkspaceSpend } from '@/lib/meta-spend-sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');
    const db = createAdminClient() as any;
    const { data: ws } = await db.from('workspaces').select('id, waba_id, access_token').eq('id', workspaceId).single();
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    const r = await syncWorkspaceSpend(db, ws);
    return NextResponse.json({ ok: !r.error, rows: r.rows, error: r.error ?? null, last_synced_at: new Date().toISOString() });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[MetaSpend refresh]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
