import { type NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { sendMail } from '@/lib/mailer';
import { APP_URL } from '@/lib/constants';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  manager:     'Manager',
  agent:       'Support Agent',
};

const INVITE_FROM = 'Agentix <noreply@aiagentix.in>';

// POST /api/team/invite
// Body: { workspaceId, email, role }
// Creates a pending team_invites row with a single-use token and emails the link.
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, email, role } = await request.json() as {
      workspaceId?: string; email?: string; role?: string;
    };

    if (!workspaceId || !email || !role) {
      return NextResponse.json({ error: 'workspaceId, email, and role required' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    if (!ROLE_LABELS[role] || role === 'super_admin') {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const auth = await requireWorkspacePermission(workspaceId, 'manage_team');

    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;

    const normalizedEmail = email.toLowerCase().trim();

    // Already a member of this workspace?
    const { data: existingProfile } = await db
      .from('profiles').select('id').eq('email', normalizedEmail).maybeSingle();
    if (existingProfile) {
      const { data: existingMember } = await db
        .from('workspace_members').select('id')
        .eq('workspace_id', workspaceId).eq('user_id', existingProfile.id).maybeSingle();
      if (existingMember) {
        return NextResponse.json({ error: 'This person is already a member of this workspace' }, { status: 409 });
      }
    }

    const { data: workspace } = await db.from('workspaces').select('name').eq('id', workspaceId).single();
    const workspaceName = (workspace?.name as string | null) ?? 'Agentix';

    const { data: inviter } = await db.from('profiles').select('full_name').eq('id', auth.userId).maybeSingle();
    const inviterName = (inviter?.full_name as string | null) ?? 'A teammate';

    const token = randomBytes(32).toString('hex');

    // Revoke any existing pending invite to this email first (partial unique index
    // only allows one pending row per workspace+email — this keeps re-inviting clean).
    await db.from('team_invites')
      .update({ status: 'revoked' })
      .eq('workspace_id', workspaceId).eq('email', normalizedEmail).eq('status', 'pending');

    const { error: insertError } = await db.from('team_invites').insert({
      workspace_id: workspaceId,
      email:        normalizedEmail,
      role,
      token,
      invited_by:   auth.userId,
    });
    if (insertError) throw new Error(insertError.message);

    const roleLabel = ROLE_LABELS[role];
    const inviteUrl = `${APP_URL}/accept-invite?token=${token}`;

    const { ok: emailSent, error: mailError } = await sendMail({
      to:      normalizedEmail,
      from:    INVITE_FROM,
      subject: `You've been invited to join ${workspaceName} on Agentix`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:32px;">🎉</span>
            <h1 style="color:#6366f1;font-size:22px;margin:8px 0;">You're invited!</h1>
          </div>
          <p style="color:#374151;font-size:15px;line-height:1.6;">
            <strong>${inviterName}</strong> has invited you to join <strong>${workspaceName}</strong> on <strong>Agentix</strong> as a <strong>${roleLabel}</strong>.
          </p>
          <p style="color:#374151;font-size:14px;line-height:1.6;margin-top:12px;">
            Agentix is a WhatsApp CRM platform for managing conversations, campaigns, and customer relationships.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${inviteUrl}" style="background:#6366f1;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
              Accept Invitation →
            </a>
          </div>
          <p style="color:#9ca3af;font-size:12px;text-align:center;">
            This invite link expires in 7 days.<br/>
            If you didn't expect this, you can safely ignore it.
          </p>
        </div>
      `,
    });

    if (!emailSent) {
      console.error('[TeamInvite] mail send failed:', mailError);
    }

    try {
      await db.from('audit_logs').insert({
        workspace_id: workspaceId,
        action: 'team.invite_sent',
        resource_type: 'workspace_member',
        metadata: { email: normalizedEmail, role },
      });
    } catch { /* table may not exist yet */ }

    return NextResponse.json({
      success: true,
      emailSent,
      message: emailSent
        ? `Invitation sent to ${normalizedEmail}`
        : `Invite created, but the email failed to send (${mailError ?? 'unknown error'}). You can resend it from the Pending Invites list.`,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamInvite]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/team/invite?workspaceId=  — list pending invites for the Team page
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_team');

    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;

    const { data, error } = await db
      .from('team_invites')
      .select('id, email, role, status, expires_at, created_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ invites: data ?? [] });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamInvite GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
