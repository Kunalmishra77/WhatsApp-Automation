import { NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/workspace/status
// Returns is_active + subscription_status for the caller's first workspace.
// Used by /pending-approval to poll for activation.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = createAdminClient() as any;

    // Get the user's workspace via workspace_members
    const { data: member } = await db
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!member?.workspace_id) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 });
    }

    const { data: ws } = await db
      .from('workspaces')
      .select('id, is_active, subscription_status, name')
      .eq('id', member.workspace_id)
      .single();

    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    return NextResponse.json({
      workspace_id:        ws.id,
      workspace_name:      ws.name,
      is_active:           ws.is_active,
      subscription_status: ws.subscription_status,
    });
  } catch (err) {
    console.error('[workspace/status]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
