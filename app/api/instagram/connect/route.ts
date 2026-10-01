import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { encryptSecret } from '@/lib/crypto-vault';
import { getWorkspaceEntitlements } from '@/lib/entitlements';

export const runtime = 'nodejs';

// POST /api/instagram/connect
// Body: { workspaceId, igUserId, pageId?, accessToken, appId?, appSecret?, username?, name?,
//         auto_reply_enabled?, comment_reply_enabled?, follow_first_enabled? }
// Secrets (access token + app secret) are AES-256-GCM encrypted at rest.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : '';
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;

    // Toggle-only update (automation switches) — no new credentials.
    const igUserId = (body.igUserId as string | undefined)?.trim();
    const accessToken = (body.accessToken as string | undefined)?.trim();
    if (!igUserId && !accessToken) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ['auto_reply_enabled', 'comment_reply_enabled', 'follow_first_enabled'] as const) {
        if (typeof body[k] === 'boolean') patch[k] = body[k];
      }
      if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
      const { error } = await db.from('instagram_accounts').update(patch).eq('workspace_id', workspaceId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (!igUserId || !accessToken) {
      return NextResponse.json({ error: 'workspaceId, igUserId, and accessToken are required' }, { status: 400 });
    }

    // Validate the token + ig_user_id against the Instagram Graph API.
    const verifyRes = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}?fields=id,name,username,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`,
    );
    const verifyData = await verifyRes.json() as { id?: string; name?: string; username?: string; error?: { message: string } };
    if (!verifyRes.ok || verifyData.error) {
      return NextResponse.json({ error: verifyData.error?.message ?? 'Invalid credentials — could not verify Instagram account' }, { status: 400 });
    }

    const appId = (body.appId as string | undefined)?.trim();
    const appSecret = (body.appSecret as string | undefined)?.trim();

    const row: Record<string, unknown> = {
      workspace_id:     workspaceId,
      ig_user_id:       igUserId,
      page_id:          (body.pageId as string | undefined)?.trim() || null,
      app_id:           appId || null,
      app_secret_enc:   appSecret ? encryptSecret(appSecret) : null,
      access_token_enc: encryptSecret(accessToken),
      access_token:     '', // legacy plaintext column cleared — enc is the source of truth
      username:         (body.username as string | undefined)?.trim() || verifyData.username || null,
      name:             (body.name as string | undefined)?.trim() || verifyData.name || null,
      status:           'connected',
      webhook_verified: true,
      updated_at:       new Date().toISOString(),
    };
    for (const k of ['auto_reply_enabled', 'comment_reply_enabled', 'follow_first_enabled'] as const) {
      if (typeof body[k] === 'boolean') row[k] = body[k];
    }

    const { error } = await db.from('instagram_accounts').upsert(row, { onConflict: 'workspace_id' });
    if (error) { console.error('[IG Connect]', error); return NextResponse.json({ error: error.message }, { status: 500 }); }

    return NextResponse.json({ success: true, username: row.username, name: row.name });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[IG Connect] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/instagram/connect?workspaceId=xxx — current connection + automation state.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data } = await db
      .from('instagram_accounts')
      .select('ig_user_id, page_id, username, name, app_id, status, webhook_verified, auto_reply_enabled, comment_reply_enabled, follow_first_enabled, created_at')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const ent = await getWorkspaceEntitlements(db, workspaceId);

    return NextResponse.json({ account: data ?? null, entitled: ent.modules.instagram });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
