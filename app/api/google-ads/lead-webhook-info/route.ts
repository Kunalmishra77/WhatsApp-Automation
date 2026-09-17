import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, AuthzError, authzResponse } from '@/lib/authz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/google-ads/lead-webhook-info?workspaceId=
// Returns (creating on first call) the workspace's Lead Form webhook URL + key
// to paste into a Google Ads Lead Form asset.
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    let { data: secret } = await db
      .from('google_ads_lead_secrets')
      .select('webhook_key')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!secret) {
      const webhook_key = crypto.randomBytes(24).toString('hex');
      const { data: created } = await db
        .from('google_ads_lead_secrets')
        .insert({ workspace_id: workspaceId, webhook_key })
        .select('webhook_key')
        .single();
      secret = created;
    }

    const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
    return NextResponse.json({
      webhookUrl: `${base}/api/webhooks/google-ads-leads?ws=${workspaceId}`,
      key: secret?.webhook_key ?? '',
    });
  } catch (err) {
    if (err instanceof AuthzError) return authzResponse(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
