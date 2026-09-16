import { type NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, GBP_SCOPE } from '@/lib/google-business';
import { syncWorkspaceGbp } from '@/lib/gbp-sync';
import { createAdminClient } from '@/services/supabase/admin';
import { createClient } from '@/services/supabase/server';

export const runtime = 'nodejs';

// GET /api/integrations/gbp/callback — OAuth redirect target. Stores the refresh
// token in gbp_connections and kicks off the first sync.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code        = searchParams.get('code');
  const workspaceId = searchParams.get('state');
  const oauthError  = searchParams.get('error');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (oauthError || !code || !workspaceId) {
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gbp=error`);
  }

  try {
    // Verify the requesting user belongs to this workspace.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(`${appUrl}/login`);

    const db = createAdminClient() as any;
    const { data: membership } = await db
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();
    if (!membership) return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gbp=error`);

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gbp=no_refresh_token`);
    }

    await db.from('gbp_connections').upsert({
      workspace_id: workspaceId,
      refresh_token: tokens.refresh_token,
      email: user.email ?? null,
      scope: GBP_SCOPE,
      status: 'connected',
      connected_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' });

    // First sync — fire-and-forget so the redirect is instant.
    void syncWorkspaceGbp(db, workspaceId);

    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gbp=success`);
  } catch (err) {
    console.error('[GBP Callback]', err);
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gbp=error`);
  }
}
