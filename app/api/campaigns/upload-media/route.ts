import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const maxDuration = 60;

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg':      'image',
  'image/png':       'image',
  'image/webp':      'image',
  'image/jpg':       'image',
  'video/mp4':       'video',
  'video/quicktime': 'video',  // iPhone .mov files
  'video/x-mp4':     'video',
  'video/3gpp':      'video',
  'application/pdf': 'document',
};

// GET /api/campaigns/upload-media?workspaceId=xxx
// Returns the 10 most recent media uploads for the workspace
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'create_campaigns');

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('media_library')
      .select('id, filename, media_id, media_type, mime_type, file_size, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/campaigns/upload-media
// Fields: file (File), workspaceId (string)
// Returns: { mediaId, mediaType, fileName, libraryId }
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
      let err: { error?: { message?: string } } = {};
      try { err = await uploadRes.json() as typeof err; } catch { /* non-JSON */ }
      return NextResponse.json({ error: err?.error?.message ?? 'WhatsApp upload failed. Check your access token.' }, { status: 400 });
    }

    const uploadData = await uploadRes.json() as { id?: string };
    const mediaId = uploadData.id;

    if (!mediaId) {
      return NextResponse.json({ error: 'No media ID returned from WhatsApp' }, { status: 500 });
    }

    // Save to media_library for reuse
    const { data: libraryRow } = await db.from('media_library').insert({
      workspace_id: workspaceId,
      filename:     file.name,
      media_id:     mediaId,
      media_type:   mediaType,
      mime_type:    file.type,
      file_size:    file.size,
    }).select('id').single();

    return NextResponse.json({
      mediaId,
      mediaType,
      fileName:  file.name,
      libraryId: (libraryRow as { id?: string } | null)?.id ?? null,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Campaign Upload Media]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
