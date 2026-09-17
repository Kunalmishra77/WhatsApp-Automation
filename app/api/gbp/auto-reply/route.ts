import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';
import { readAutoReplyConfig } from '@/lib/gbp-auto-reply';

export const runtime = 'nodejs';

// GET /api/gbp/auto-reply?workspaceId=...  → { enabled, minStars }
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const { data: ws } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    return NextResponse.json(readAutoReplyConfig(ws?.settings));
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[GBP auto-reply GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/gbp/auto-reply  Body: { workspaceId, enabled, minStars? }
// Merges the auto-reply flags into workspaces.settings without clobbering it.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, enabled, minStars } = await request.json() as {
      workspaceId?: string; enabled?: boolean; minStars?: number;
    };
    if (!workspaceId || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'workspaceId and enabled required' }, { status: 400 });
    }
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: ws } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    const settings = { ...(ws?.settings ?? {}) } as Record<string, unknown>;

    settings.gbp_auto_reply_enabled = enabled;
    if (typeof minStars === 'number' && Number.isFinite(minStars)) {
      settings.gbp_auto_reply_min_stars = Math.min(Math.max(Math.round(minStars), 1), 5);
    }

    const { error } = await db.from('workspaces').update({ settings }).eq('id', workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(readAutoReplyConfig(settings));
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    console.error('[GBP auto-reply POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
