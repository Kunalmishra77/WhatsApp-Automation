import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { generateApiKey } from '@/lib/api-auth';

// GET — list keys (no secret shown)
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data } = await db
      .from('workspace_api_keys')
      .select('id, name, key_prefix, is_active, last_used_at, expires_at, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    return NextResponse.json({ keys: data ?? [] });
  } catch (e) { return authzResponse(e); }
}

// POST — create key (returns full key ONCE)
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, name, expiresAt } = await request.json() as {
      workspaceId?: string; name?: string; expiresAt?: string;
    };
    if (!workspaceId || !name?.trim()) {
      return NextResponse.json({ error: 'workspaceId and name required' }, { status: 400 });
    }
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const { key, hash, prefix } = await generateApiKey();
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('workspace_api_keys')
      .insert({
        workspace_id: workspaceId,
        name: name.trim(),
        key_hash: hash,
        key_prefix: prefix,
        expires_at: expiresAt ?? null,
      })
      .select('id, name, key_prefix, created_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Return full key only once
    return NextResponse.json({ ...data, key });
  } catch (e) {
    if (e instanceof AuthzError) return authzResponse(e);
    return authzResponse(e);
  }
}

// PATCH — toggle active
export async function PATCH(request: NextRequest) {
  try {
    const { id, workspaceId, isActive } = await request.json() as {
      id?: string; workspaceId?: string; isActive?: boolean;
    };
    if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    await db.from('workspace_api_keys').update({ is_active: isActive }).eq('id', id).eq('workspace_id', workspaceId);
    return NextResponse.json({ success: true });
  } catch (e) { return authzResponse(e); }
}

// DELETE — revoke key
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    await db.from('workspace_api_keys').delete().eq('id', id).eq('workspace_id', workspaceId);
    return NextResponse.json({ success: true });
  } catch (e) { return authzResponse(e); }
}
