import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/media-library?workspaceId=&tag=product
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const tag         = searchParams.get('tag');
    const search      = searchParams.get('search');

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'create_campaigns');
    const db = createAdminClient() as any;

    let query = db.from('media_library')
      .select('id, filename, media_id, public_url, media_type, tags, description, created_at, last_used_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (tag) query = query.contains('tags', [tag]);
    if (search) query = query.ilike('filename', `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/media-library
// Body: { workspaceId, url, mediaType, filename?, tags?, description? }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, url, mediaType, filename, tags, description } = await request.json() as {
      workspaceId?: string;
      url?: string;
      mediaType?: string;
      filename?: string;
      tags?: string[];
      description?: string;
    };

    if (!workspaceId || !url || !mediaType) {
      return NextResponse.json({ error: 'workspaceId, url, and mediaType required' }, { status: 400 });
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return NextResponse.json({ error: 'URL must start with http:// or https://' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'create_campaigns');
    const db = createAdminClient() as any;

    const displayName = filename || url.split('/').pop()?.split('?')[0] || 'media';
    const normalizedTags = (tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean);

    // Upsert by URL
    const { data, error } = await db.from('media_library').upsert({
      workspace_id: workspaceId,
      filename:     displayName,
      media_id:     url,
      public_url:   url,
      media_type:   mediaType,
      mime_type:    mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'application/pdf',
      file_size:    0,
      tags:         normalizedTags,
      description:  description ?? null,
    }, { onConflict: 'workspace_id,media_id' })
      .select('id, filename, media_id, public_url, media_type, tags, description, created_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ item: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[media-library POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/media-library — update tags/description or mark as recently used
export async function PATCH(request: NextRequest) {
  try {
    const { workspaceId, id, tags, description, filename, mark_used } = await request.json() as {
      workspaceId?: string;
      id?: string;
      tags?: string[];
      description?: string;
      filename?: string;
      mark_used?: boolean;
    };
    if (!workspaceId || !id) return NextResponse.json({ error: 'workspaceId and id required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'create_campaigns');
    const db = createAdminClient() as any;

    const update: Record<string, unknown> = {};
    if (tags !== undefined) update.tags = tags.map((t) => t.toLowerCase().trim()).filter(Boolean);
    if (description !== undefined) update.description = description;
    if (filename !== undefined) update.filename = filename;
    if (mark_used) update.last_used_at = new Date().toISOString();

    const { data, error } = await db.from('media_library')
      .update(update)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ item: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
