import { type NextRequest, NextResponse } from 'next/server';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// POST /api/team/invite
// Body: { workspaceId, email, role }
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

    await requireWorkspacePermission(workspaceId, 'manage_team');

    const { createAdminClient } = await import('@/services/supabase/admin');
    const db = createAdminClient() as any;

    const { data: workspace } = await db
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single();

    const workspaceName = (workspace?.name as string | null) ?? 'Agentix';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.aiagentixdev.com';
    const resendKey = process.env.RESEND_API_KEY;

    if (resendKey) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Agentix <noreply@aiagentix.in>',
          to: [email],
          subject: `You've been invited to join ${workspaceName} on Agentix`,
          html: `
            <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px;">
              <div style="text-align:center;margin-bottom:24px;">
                <span style="font-size:32px;">🎉</span>
                <h1 style="color:#6366f1;font-size:22px;margin:8px 0;">You're invited!</h1>
              </div>
              <p style="color:#374151;font-size:15px;line-height:1.6;">
                You've been invited to join <strong>${workspaceName}</strong> on <strong>Agentix</strong> as a <strong>${role}</strong>.
              </p>
              <p style="color:#374151;font-size:14px;line-height:1.6;margin-top:12px;">
                Agentix is a WhatsApp CRM platform for managing conversations, campaigns, and customer relationships.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${appUrl}/signup" style="background:#6366f1;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
                  Accept Invitation →
                </a>
              </div>
              <p style="color:#9ca3af;font-size:12px;text-align:center;">
                Use the email address this was sent to when signing up.<br/>
                If you didn't expect this, you can safely ignore it.
              </p>
            </div>
          `,
        }),
      });

      if (!emailRes.ok) {
        console.error('[TeamInvite] Resend error:', await emailRes.text());
      }
    }

    // Log to audit_logs
    try {
      await db.from('audit_logs').insert({
        workspace_id: workspaceId,
        action: 'team.invite_sent',
        resource_type: 'workspace_member',
        metadata: { email, role },
      });
    } catch { /* table may not exist yet */ }

    return NextResponse.json({
      success: true,
      emailSent: !!resendKey,
      message: resendKey
        ? `Invitation sent to ${email}`
        : `Invite recorded. Set RESEND_API_KEY in environment variables to send emails automatically.`,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[TeamInvite]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
