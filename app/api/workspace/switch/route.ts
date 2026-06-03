import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { ROUTES } from '@/lib/constants';

// GET /api/workspace/switch?id=WORKSPACE_ID
// Validates user is a member, sets active_workspace_id cookie, redirects to dashboard
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get('id');
  if (!workspaceId) {
    return NextResponse.redirect(new URL(ROUTES.DASHBOARD, request.url));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(ROUTES.LOGIN, request.url));

  // Verify membership before accepting the switch
  const { data: member } = await (supabase as any)
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  const targetId = member ? workspaceId : null;

  const response = NextResponse.redirect(new URL(ROUTES.DASHBOARD, request.url));

  if (targetId) {
    response.cookies.set('active_workspace_id', targetId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }

  return response;
}
