import { type NextRequest, NextResponse } from 'next/server';
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

// DELETE /api/team/invite/[id]?workspaceId=  — revoke a pending invite
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_team');

    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;

    const { error } = await db
      .from('team_invites')
      .update({ status: 'revoked' })
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamInvite DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/team/invite/[id]?workspaceId=  — resend the invite email (same token, no new row)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_team');

    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;

    const { data: invite } = await db
      .from('team_invites')
      .select('id, email, role, token, status, expires_at')
      .eq('id', id).eq('workspace_id', workspaceId).single();

    if (!invite || invite.status !== 'pending') {
      return NextResponse.json({ error: 'Invite not found or no longer pending' }, { status: 404 });
    }

    // Refresh expiry on resend so an old link doesn't quietly die right after resending
    await db.from('team_invites')
      .update({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', id);

    const { data: workspace } = await db.from('workspaces').select('name').eq('id', workspaceId).single();
    const workspaceName = (workspace?.name as string | null) ?? 'Agentix';
    const roleLabel = ROLE_LABELS[invite.role] ?? invite.role;
    const inviteUrl = `${APP_URL}/accept-invite?token=${invite.token}`;

    const { ok: emailSent, error: mailError } = await sendMail({
      to:      invite.email,
      from:    INVITE_FROM,
      subject: `Reminder: you're invited to join ${workspaceName} on Agentix`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:32px;">🎉</span>
            <h1 style="color:#6366f1;font-size:22px;margin:8px 0;">You're invited!</h1>
          </div>
          <p style="color:#374151;font-size:15px;line-height:1.6;">
            Reminder: you've been invited to join <strong>${workspaceName}</strong> on <strong>Agentix</strong> as a <strong>${roleLabel}</strong>.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${inviteUrl}" style="background:#6366f1;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
              Accept Invitation →
            </a>
          </div>
          <p style="color:#9ca3af;font-size:12px;text-align:center;">This invite link expires in 7 days.</p>
        </div>
      `,
    });

    if (!emailSent) console.error('[TeamInvite Resend] mail send failed:', mailError);

    return NextResponse.json({ success: true, emailSent });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamInvite Resend]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
