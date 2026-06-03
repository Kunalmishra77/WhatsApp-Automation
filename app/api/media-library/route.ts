import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/media-library
// Save a public URL as a reusable media entry
// Body: { workspaceId, url, mediaType, filename? }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, url, mediaType, filename } = await request.json() as {
      workspaceId?: string;
      url?: string;
      mediaType?: string;
      filename?: string;
    };

    if (!workspaceId || !url || !mediaType) {
      return NextResponse.json({ error: 'workspaceId, url, and mediaType required' }, { status: 400 });
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return NextResponse.json({ error: 'URL must start with http:// or https://' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'create_campaigns');

    const db = createAdminClient() as any;

    // Avoid duplicates — if same URL already exists, return it
    const { data: existing } = await db
      .from('media_library')
      .select('id, media_id, filename, media_type, created_at')
      .eq('workspace_id', workspaceId)
      .eq('media_id', url)
      .maybeSingle();

    if (existing) return NextResponse.json({ item: existing });

    const displayName = filename || url.split('/').pop()?.split('?')[0] || 'media';

    const { data } = await db.from('media_library').insert({
      workspace_id: workspaceId,
      filename:     displayName,
      media_id:     url,          // store URL directly in media_id field (TEXT)
      media_type:   mediaType,
      mime_type:    mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'application/pdf',
      file_size:    0,
    }).select('id, filename, media_id, media_type, created_at').single();

    return NextResponse.json({ item: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[media-library POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
