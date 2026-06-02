import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

const BUCKET = 'media-uploads';
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

// POST /api/media/upload  (multipart/form-data)
// Fields: file (required), workspaceId (required)
// Returns: { url, path, size, mimeType }
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file        = form.get('file')        as File | null;
    const workspaceId = form.get('workspaceId') as string | null;

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    if (!file)        return NextResponse.json({ error: 'file required' },        { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 413 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');

    const db      = createAdminClient() as any;
    const buffer  = await file.arrayBuffer();
    const ext     = file.name.split('.').pop() ?? 'bin';
    const path    = `${workspaceId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType:    file.type,
        cacheControl:   '3600',
        upsert:         false,
      });

    if (uploadError) {
      console.error('[MediaUpload]', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
      url:      publicUrl,
      path,
      size:     file.size,
      mimeType: file.type,
      name:     file.name,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/media/upload?path=&workspaceId=
export async function DELETE(request: NextRequest) {
  try {
    const path        = request.nextUrl.searchParams.get('path');
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!path || !workspaceId) return NextResponse.json({ error: 'path and workspaceId required' }, { status: 400 });
    if (!path.startsWith(workspaceId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await requireWorkspacePermission(workspaceId, 'handle_conversations');
    const db = createAdminClient() as any;
    await db.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
