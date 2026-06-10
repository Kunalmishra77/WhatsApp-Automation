import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const maxDuration = 60;

const ALLOWED_TYPES: Record<string, true> = {
  'image/jpeg':      true,
  'image/png':       true,
  'image/webp':      true,
  'video/mp4':       true,
  'application/pdf': true,
};

// POST /api/templates/upload-media
// Uploads media using Meta's Resumable Upload API and returns a header_handle
// suitable for use in WhatsApp template header components.
// Fields: file (File), workspaceId (string)
// Returns: { handle }  where handle is used as header_handle in template creation
export async function POST(request: NextRequest) {
  try {
    const formData    = await request.formData();
    const file        = formData.get('file') as File | null;
    const workspaceId = formData.get('workspaceId') as string | null;

    if (!file || !workspaceId) {
      return NextResponse.json({ error: 'file and workspaceId required' }, { status: 400 });
    }

    if (!ALLOWED_TYPES[file.type]) {
      return NextResponse.json(
        { error: `Unsupported type: ${file.type}. Use JPEG/PNG/WebP/MP4/PDF.` },
        { status: 400 },
      );
    }

    if (file.size > 16 * 1024 * 1024) {
      return NextResponse.json({ error: 'Max file size is 16 MB' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const db = createAdminClient() as any;
    const { data: ws } = await db
      .from('workspaces')
      .select('access_token')
      .eq('id', workspaceId)
      .single();

    const accessToken = (ws?.access_token as string | undefined)?.replace(/﻿/g, '').trim()
      ?? process.env.WHATSAPP_ACCESS_TOKEN?.replace(/﻿/g, '').trim();

    const appId = process.env.WHATSAPP_APP_ID;

    if (!accessToken) {
      return NextResponse.json({ error: 'WhatsApp access token not configured' }, { status: 400 });
    }
    if (!appId) {
      return NextResponse.json(
        { error: 'WHATSAPP_APP_ID env variable is not set. Add your Facebook App ID to environment variables.' },
        { status: 400 },
      );
    }

    // ── Step 1: Create Resumable Upload session ──────────────────────────────
    const sessionUrl = new URL(`https://graph.facebook.com/v19.0/${appId}/uploads`);
    sessionUrl.searchParams.set('file_length', String(file.size));
    sessionUrl.searchParams.set('file_type', file.type);
    sessionUrl.searchParams.set('file_name', file.name);
    sessionUrl.searchParams.set('access_token', accessToken);

    const sessionRes = await fetch(sessionUrl.toString(), { method: 'POST' });
    const sessionData = await sessionRes.json() as { id?: string; error?: { message?: string; error_user_msg?: string } };

    if (!sessionRes.ok || !sessionData.id) {
      const msg = sessionData?.error?.error_user_msg ?? sessionData?.error?.message ?? 'Failed to create upload session';
      console.error('[TemplateUpload] Session error:', JSON.stringify(sessionData));
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const uploadSessionId = sessionData.id;

    // ── Step 2: Upload the file bytes ────────────────────────────────────────
    const fileBuffer = await file.arrayBuffer();

    const uploadRes = await fetch(`https://graph.facebook.com/v19.0/${uploadSessionId}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${accessToken}`,
        file_offset:   '0',
        'Content-Type': file.type,
      },
      body: fileBuffer,
    });

    const uploadData = await uploadRes.json() as { h?: string; error?: { message?: string; error_user_msg?: string } };

    if (!uploadRes.ok || !uploadData.h) {
      const msg = uploadData?.error?.error_user_msg ?? uploadData?.error?.message ?? 'File upload failed';
      console.error('[TemplateUpload] Upload error:', JSON.stringify(uploadData));
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ handle: uploadData.h, fileName: file.name });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TemplateUpload] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
