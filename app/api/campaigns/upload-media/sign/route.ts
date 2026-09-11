import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const runtime = 'nodejs';

const BUCKET = 'media-uploads';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg':      'image',
  'image/png':       'image',
  'image/webp':      'image',
  'image/jpg':       'image',
  'video/mp4':       'video',
  'video/quicktime': 'video',
  'video/x-mp4':     'video',
  'video/3gpp':      'video',
  'application/pdf': 'document',
};

// POST /api/campaigns/upload-media/sign
// Body (JSON): { workspaceId, fileName, fileType, fileSize }
// Returns a signed upload URL so the browser can upload the file DIRECTLY to Supabase
// Storage, bypassing our own server + reverse proxy (which drops large bodies with a 502).
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, fileName, fileType, fileSize } = (await request.json().catch(() => ({}))) as {
      workspaceId?: string; fileName?: string; fileType?: string; fileSize?: number;
    };

    if (!workspaceId || !fileName || !fileType) {
      return NextResponse.json({ error: 'workspaceId, fileName and fileType required' }, { status: 400 });
    }
    const mediaType = ALLOWED_TYPES[fileType];
    if (!mediaType) {
      return NextResponse.json({ error: `Unsupported type: ${fileType}. Use JPEG/PNG/WebP/MP4/PDF.` }, { status: 400 });
    }
    if (typeof fileSize === 'number' && fileSize > 16 * 1024 * 1024) {
      return NextResponse.json({ error: 'Max 16 MB' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'create_campaigns');

    const db  = createAdminClient() as any;
    const ext = (fileName.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
    // Temp path, always scoped under the workspace so finalize can verify ownership.
    const path = `campaign-tmp/${workspaceId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data?.token) {
      console.error('[Campaign Upload Sign]', error);
      return NextResponse.json({ error: 'Could not start upload' }, { status: 500 });
    }

    return NextResponse.json({ path, token: data.token, mediaType });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Campaign Upload Sign]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
