import { type NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/google-calendar';
import { createAdminClient } from '@/services/supabase/admin';
import { createClient } from '@/services/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code        = searchParams.get('code');
  const workspaceId = searchParams.get('state');
  const error       = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (error || !code || !workspaceId) {
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gcal=error`);
  }

  try {
    // Verify the requesting user is a member of this workspace
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
    if (!membership) {
      return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gcal=error`);
    }

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gcal=no_refresh_token`);
    }

    // Save refresh token + calendar ID (primary = 'primary') into workspace settings JSONB
    const { data: ws } = await db.from('workspaces').select('settings').eq('id', workspaceId).single();
    const currentSettings = (ws?.settings ?? {}) as Record<string, unknown>;

    await db.from('workspaces').update({
      settings: {
        ...currentSettings,
        google_calendar_refresh_token: tokens.refresh_token,
        google_calendar_id: 'primary',
        google_calendar_connected_at: new Date().toISOString(),
      },
    }).eq('id', workspaceId);

    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gcal=success`);
  } catch (err) {
    console.error('[GCal Callback]', err);
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&gcal=error`);
  }
}
