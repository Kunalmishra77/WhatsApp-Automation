import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const maxDuration = 30;

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'image',
  'image/png':  'image',
  'image/webp': 'image',
  'video/mp4':  'video',
  'application/pdf': 'document',
};

// POST /api/campaigns/upload-media
// Fields: file (File), workspaceId (string)
// Returns: { mediaId, mediaType }
export async function POST(request: NextRequest) {
  try {
    const formData    = await request.formData();
    const file        = formData.get('file') as File | null;
    const workspaceId = formData.get('workspaceId') as string | null;

    if (!file || !workspaceId) {
      return NextResponse.json({ error: 'file and workspaceId required' }, { status: 400 });
    }

    const mediaType = ALLOWED_TYPES[file.type];
    if (!mediaType) {
      return NextResponse.json({ error: `Unsupported type: ${file.type}. Use JPEG/PNG/WebP/MP4/PDF.` }, { status: 400 });
    }

    if (file.size > 16 * 1024 * 1024) {
      return NextResponse.json({ error: 'Max 16 MB' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'create_campaigns');

    const db = createAdminClient() as any;
    const { data: ws } = await db
      .from('workspaces')
      .select('phone_number_id, access_token')
      .eq('id', workspaceId)
      .single();

    if (!ws?.phone_number_id || !ws?.access_token) {
      return NextResponse.json({ error: 'Workspace WhatsApp credentials missing' }, { status: 400 });
    }

    // Upload to WhatsApp Media API
    const uploadForm = new FormData();
    uploadForm.append('messaging_product', 'whatsapp');
    uploadForm.append('file', file, file.name);
    uploadForm.append('type', file.type);

    const uploadRes = await fetch(
      `https://graph.facebook.com/v19.0/${ws.phone_number_id as string}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${(ws.access_token as string).replace(/﻿/g, '').trim()}` },
        body: uploadForm,
      },
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.json() as { error?: { message?: string } };
      return NextResponse.json({ error: err?.error?.message ?? 'WhatsApp upload failed' }, { status: 400 });
    }

    const uploadData = await uploadRes.json() as { id?: string };
    const mediaId = uploadData.id;

    if (!mediaId) {
      return NextResponse.json({ error: 'No media ID returned from WhatsApp' }, { status: 500 });
    }

    return NextResponse.json({ mediaId, mediaType, fileName: file.name });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Campaign Upload Media]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
