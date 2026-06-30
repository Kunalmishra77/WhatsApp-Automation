import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { signUp, signInWithPassword } from '@/modules/auth/services/auth.service';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  manager:     'Manager',
  agent:       'Support Agent',
};

// GET /api/team/invite/accept?token=  — validate a token and return display info
// for the Accept-Invite page, without exposing any other invite rows.
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;

    const { data: invite } = await db
      .from('team_invites')
      .select('email, role, status, expires_at, workspace_id, workspaces(name)')
      .eq('token', token)
      .maybeSingle();

    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'This invite has already been used or revoked' }, { status: 410 });
    }
    if (new Date(invite.expires_at) < new Date()) {
      await db.from('team_invites').update({ status: 'expired' }).eq('token', token);
      return NextResponse.json({ error: 'This invite has expired' }, { status: 410 });
    }

    const { data: existingProfile } = await db
      .from('profiles').select('id').eq('email', invite.email).maybeSingle();

    return NextResponse.json({
      email:         invite.email,
      role:          invite.role,
      roleLabel:     ROLE_LABELS[invite.role] ?? invite.role,
      workspaceName: invite.workspaces?.name ?? 'Agentix',
      accountExists: !!existingProfile,
    });
  } catch (error) {
    console.error('[AcceptInvite GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/team/invite/accept
// Body: { token, fullName?, password? }
// - New email: creates the auth user (pre-confirmed) + signs them in.
// - Existing email: requires them to already be logged in as that exact email
//   (no password reset is granted here — they log in normally, then re-visit
//   the invite link, which then just attaches workspace membership).
// In both cases inserts workspace_members directly — never goes through
// createWorkspaceAction, which would give them a brand-new separate workspace.
export async function POST(request: NextRequest) {
  try {
    const { token, fullName, password } = await request.json() as {
      token?: string; fullName?: string; password?: string;
    };
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;

    const { data: invite } = await db
      .from('team_invites')
      .select('id, email, role, status, expires_at, workspace_id')
      .eq('token', token).maybeSingle();

    if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'This invite has already been used or revoked' }, { status: 410 });
    }
    if (new Date(invite.expires_at) < new Date()) {
      await db.from('team_invites').update({ status: 'expired' }).eq('id', invite.id);
      return NextResponse.json({ error: 'This invite has expired' }, { status: 410 });
    }

    const { data: existingProfile } = await db
      .from('profiles').select('id').eq('email', invite.email).maybeSingle();

    let userId: string;

    if (existingProfile) {
      // Existing account — must already be authenticated as this exact email.
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.email?.toLowerCase() !== invite.email.toLowerCase()) {
        return NextResponse.json(
          { error: 'ALREADY_HAS_ACCOUNT', message: 'An account with this email already exists. Please log in first, then open the invite link again.' },
          { status: 409 },
        );
      }
      userId = user.id;
    } else {
      if (!fullName || !password) {
        return NextResponse.json({ error: 'fullName and password required for new accounts' }, { status: 400 });
      }
      if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        return NextResponse.json({ error: 'Password must be at least 8 characters with 1 uppercase letter and 1 number' }, { status: 400 });
      }
      const { user, error: signUpError } = await signUp(invite.email, password, fullName);
      if (signUpError || !user) {
        return NextResponse.json({ error: signUpError ?? 'Failed to create account' }, { status: 500 });
      }
      const { error: signInError } = await signInWithPassword(invite.email, password);
      if (signInError) {
        return NextResponse.json({ error: signInError }, { status: 500 });
      }
      userId = user.id;
    }

    // Already a member of this workspace (e.g. double-accept)?
    const { data: existingMember } = await db
      .from('workspace_members').select('id')
      .eq('workspace_id', invite.workspace_id).eq('user_id', userId).maybeSingle();

    if (!existingMember) {
      const { error: memberError } = await db.from('workspace_members').insert({
        workspace_id: invite.workspace_id,
        user_id:      userId,
        role:         invite.role,
      });
      if (memberError) {
        return NextResponse.json({ error: memberError.message }, { status: 500 });
      }
    }

    await db.from('team_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AcceptInvite POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
