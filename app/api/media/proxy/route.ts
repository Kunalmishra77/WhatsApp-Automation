import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const maxDuration = 30;

// GET /api/media/proxy?mediaId=xxx&workspaceId=xxx
// Fetches a WhatsApp-hosted media file via the Graph API and streams it to the browser.
// WhatsApp media IDs require Bearer token auth — browsers can't fetch them directly.
export async function GET(request: NextRequest) {
  try {
    const sp          = request.nextUrl.searchParams;
    const mediaId     = sp.get('mediaId');
    const workspaceId = sp.get('workspaceId');

    if (!workspaceId || !mediaId) {
      return NextResponse.json({ error: 'mediaId and workspaceId required' }, { status: 400 });
    }

    // If it's already a public URL, redirect directly
    if (mediaId.startsWith('http://') || mediaId.startsWith('https://')) {
      return NextResponse.redirect(mediaId);
    }

    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const { data: ws } = await db
      .from('workspaces')
      .select('access_token')
      .eq('id', workspaceId)
      .single();

    if (!ws?.access_token) {
      return NextResponse.json({ error: 'Workspace not configured' }, { status: 400 });
    }

    const token = (ws.access_token as string).replace(/﻿/g, '').trim();

    // Step 1: resolve the media download URL from WhatsApp Graph API
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!metaRes.ok) {
      return NextResponse.json({ error: 'Media not found on WhatsApp' }, { status: 404 });
    }

    const metaData = await metaRes.json() as { url?: string; mime_type?: string };
    if (!metaData.url) {
      return NextResponse.json({ error: 'No download URL returned' }, { status: 404 });
    }

    // Step 2: fetch the actual bytes
    const mediaRes = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!mediaRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch media bytes' }, { status: 502 });
    }

    const contentType = metaData.mime_type ?? mediaRes.headers.get('content-type') ?? 'application/octet-stream';
    const body = await mediaRes.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        'Content-Type':  contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Media Proxy]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
