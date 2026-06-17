import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { createClient } from '@/services/supabase/server';

export const maxDuration = 60;

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const auth   = request.headers.get('authorization');
  if (secret && auth === `Bearer ${secret}`) return true;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const db = createAdminClient() as any;
    const { data: profile } = await db.from('profiles').select('is_platform_admin').eq('id', user.id).single();
    return profile?.is_platform_admin === true;
  } catch {
    return false;
  }
}

// POST /api/cron/purge-deleted-workspaces
// Run daily — permanently deletes workspaces that have been in trash for 7+ days
export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = createAdminClient() as any;
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Find workspaces that have been deleted for 7+ days
    const { data: expired } = await db
      .from('workspaces')
      .select('id')
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoff);

    if (!expired?.length) {
      return NextResponse.json({ purged: 0, message: 'No expired workspaces found' });
    }

    let purged = 0;
    for (const ws of expired as Array<{ id: string }>) {
      // Get members before deleting workspace (cascade will remove workspace_members)
      const { data: members } = await db
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', ws.id);

      await db.from('workspaces').delete().eq('id', ws.id);

      // Delete auth users who no longer belong to any workspace
      if (members?.length) {
        for (const m of members as Array<{ user_id: string }>) {
          const { count } = await db
            .from('workspace_members')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', m.user_id);
          if ((count ?? 0) === 0) {
            await db.auth.admin.deleteUser(m.user_id);
          }
        }
      }
      purged++;
    }

    console.log(`[cron/purge-deleted-workspaces] Permanently deleted ${purged} workspace(s)`);
    return NextResponse.json({ purged, message: `Purged ${purged} workspace(s) from trash` });
  } catch (err) {
    console.error('[cron/purge-deleted-workspaces]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
