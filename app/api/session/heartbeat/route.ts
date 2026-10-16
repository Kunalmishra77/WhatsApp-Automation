import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, refreshSession } from '@/lib/session';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';
import { resolveActiveWorkspaceId } from '@/lib/active-workspace';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await refreshSession(token);
  }

  // Stamp the member's own last-active time as well. The session row above only
  // exists for roles the session gate applies to, so without this an agent's
  // profile would never show when they were last around.
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const workspaceId = await resolveActiveWorkspaceId(user.id);
      if (workspaceId) {
        const db = createAdminClient() as any;
        await db
          .from('workspace_members')
          .update({ last_active_at: new Date().toISOString() })
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id);
      }
    }
  } catch {
    // A heartbeat must never surface an error to the client.
  }

  return NextResponse.json({ ok: true });
}
