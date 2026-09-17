import { type NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, ADWORDS_SCOPE } from '@/lib/google-ads';
import { syncWorkspaceAds } from '@/lib/google-ads-sync';
import { createAdminClient } from '@/services/supabase/admin';
import { createClient } from '@/services/supabase/server';

export const runtime = 'nodejs';

// GET /api/integrations/google-ads/callback
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const workspaceId = searchParams.get('state');
  const oauthError = searchParams.get('error');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (oauthError || !code || !workspaceId) {
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gads=error`);
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(`${appUrl}/login`);

    const db = createAdminClient() as any;
    const { data: membership } = await db
      .from('workspace_members').select('role')
      .eq('workspace_id', workspaceId).eq('user_id', user.id).single();
    if (!membership) return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gads=error`);

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gads=no_refresh_token`);
    }

    await db.from('google_ads_connections').upsert({
      workspace_id: workspaceId,
      refresh_token: tokens.refresh_token,
      email: user.email ?? null,
      status: 'connected',
      connected_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' });

    // First sync (resolves customer id + pulls metrics). Fire-and-forget; will
    // no-op gracefully until the developer token is configured/approved.
    void syncWorkspaceAds(db, workspaceId);

    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gads=success`);
  } catch (err) {
    console.error('[GoogleAds Callback]', err);
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gads=error`);
  }
}
