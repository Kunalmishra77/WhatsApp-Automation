import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/instagram/connect
// Body: { workspaceId, igUserId, pageId?, accessToken, username?, name? }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, igUserId, pageId, accessToken, username, name } = await request.json() as {
      workspaceId?: string;
      igUserId?: string;
      pageId?: string;
      accessToken?: string;
      username?: string;
      name?: string;
    };

    if (!workspaceId || !igUserId || !accessToken) {
      return NextResponse.json({ error: 'workspaceId, igUserId, and accessToken are required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    // Validate the token + ig_user_id by calling Instagram Graph API
    const verifyRes = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}?fields=id,name,username,profile_picture_url&access_token=${accessToken}`,
    );
    const verifyData = await verifyRes.json() as { id?: string; name?: string; username?: string; error?: { message: string } };

    if (!verifyRes.ok || verifyData.error) {
      return NextResponse.json({
        error: verifyData.error?.message ?? 'Invalid credentials — could not verify Instagram account',
      }, { status: 400 });
    }

    const db = createAdminClient() as any;

    await db.from('instagram_accounts').upsert(
      {
        workspace_id:     workspaceId,
        ig_user_id:       igUserId,
        page_id:          pageId ?? null,
        access_token:     accessToken,
        username:         username ?? verifyData.username ?? null,
        name:             name ?? verifyData.name ?? null,
        webhook_verified: false,
      },
      { onConflict: 'workspace_id' },
    );

    return NextResponse.json({
      success:  true,
      username: username ?? verifyData.username,
      name:     name ?? verifyData.name,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[IG Connect] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/instagram/connect?workspaceId=xxx — fetch current connection
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data } = await db
      .from('instagram_accounts')
      .select('ig_user_id, page_id, username, name, webhook_verified, created_at')
      .eq('workspace_id', workspaceId)
      .single();

    return NextResponse.json({ account: data ?? null });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
