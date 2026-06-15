import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

// GET /api/cron/daily-digest?secret=<CRON_SECRET>
// Sends a morning metrics email to workspace admins via Resend API (plain fetch — no SDK)
export async function GET(request: NextRequest) {
  const secret  = request.nextUrl.searchParams.get('secret') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  const allowed    = !!cronSecret && secret === cronSecret;
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn('[DailyDigest] RESEND_API_KEY not set — skipping email');
    return NextResponse.json({ skipped: true, reason: 'RESEND_API_KEY not configured' });
  }

  const db  = createAdminClient() as any;
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3_600_000);

  // Get all workspaces
  const { data: workspaces } = await db.from('workspaces').select('id, name');
  if (!workspaces?.length) return NextResponse.json({ sent: 0 });

  let sent = 0;

  for (const ws of workspaces as Array<{ id: string; name: string }>) {
    // Get admin emails for this workspace
    const { data: admins } = await db
      .from('workspace_members')
      .select('profiles:user_id(email, full_name)')
      .eq('workspace_id', ws.id)
      .in('role', ['super_admin', 'admin']);

    const adminEmails = (admins ?? [])
      .map((a: { profiles?: { email?: string } }) => a.profiles?.email)
      .filter(Boolean) as string[];

    if (!adminEmails.length) continue;

    // Gather yesterday's stats
    const [convRes, msgRes, resolvedRes, csatRes] = await Promise.all([
      db.from('conversations').select('id', { count: 'exact', head: true })
        .eq('workspace_id', ws.id).gte('created_at', yesterday.toISOString()),
      db.from('messages').select('id', { count: 'exact', head: true })
        .eq('workspace_id', ws.id).gte('created_at', yesterday.toISOString()),
      db.from('conversations').select('id', { count: 'exact', head: true })
        .eq('workspace_id', ws.id).eq('status', 'resolved').gte('resolved_at', yesterday.toISOString()),
      db.from('csat_responses').select('score')
        .eq('workspace_id', ws.id).gte('responded_at', yesterday.toISOString()).not('score', 'is', null),
    ]);

    const newConvs    = convRes.count     ?? 0;
    const newMsgs     = msgRes.count      ?? 0;
    const resolved    = resolvedRes.count ?? 0;
    const csatScores  = (csatRes.data ?? []) as Array<{ score: number }>;
    const avgCsat     = csatScores.length
      ? (csatScores.reduce((s: number, r: { score: number }) => s + r.score, 0) / csatScores.length).toFixed(1)
      : '—';

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <h2 style="font-size:20px;color:#1a1a1a;margin-bottom:4px;">📊 Daily Digest — ${ws.name}</h2>
        <p style="color:#666;font-size:13px;margin-bottom:24px;">${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
          ${[
            ['💬 New Conversations', newConvs],
            ['✅ Resolved', resolved],
            ['📨 Messages', newMsgs],
            ['⭐ Avg CSAT', avgCsat],
          ].map(([label, value]) => `
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;">
              <p style="font-size:24px;font-weight:700;color:#111;margin:0;">${value}</p>
              <p style="font-size:12px;color:#666;margin:4px 0 0;">${label}</p>
            </div>
          `).join('')}
        </div>

        <p style="font-size:12px;color:#aaa;border-top:1px solid #f0f0f0;padding-top:12px;">
          Agentix WhatsApp CRM · <a href="https://whatsapp-automation-kohl-six.vercel.app" style="color:#6366f1;">Open Dashboard</a>
        </p>
      </div>
    `;

    for (const email of adminEmails) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:    'Agentix <onboarding@resend.dev>',
            to:      email,
            subject: `Daily Digest — ${ws.name} — ${now.toLocaleDateString()}`,
            html,
          }),
        });
        sent++;
      } catch {
        // silent fail per recipient
      }
    }
  }

  return NextResponse.json({ sent });
}
