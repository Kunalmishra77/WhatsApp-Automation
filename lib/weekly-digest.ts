// lib/weekly-digest.ts
// Builds and sends a weekly performance digest email to a workspace's admins.
// Fail-soft: any failure logs and returns without throwing.

import { sendMail } from '@/lib/mailer';

export interface DigestResult { sent: number; skipped: boolean; error?: string }

export type DigestPeriod = 'week' | 'month';
const DAY_MS = 24 * 60 * 60 * 1000;

async function countSince(db: any, table: string, workspaceId: string, sinceIso: string, dateCol = 'created_at', extra?: (q: any) => any): Promise<number> {
  let q = db.from(table).select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId).gte(dateCol, sinceIso);
  if (extra) q = extra(q);
  const { count } = await q;
  return count ?? 0;
}

export async function sendWeeklyDigest(
  db: any,
  workspace: { id: string; name?: string | null },
  period: DigestPeriod = 'week',
): Promise<DigestResult> {
  try {
    const days = period === 'month' ? 30 : 7;
    const periodLabel = period === 'month' ? 'monthly' : 'weekly';
    const rangeLabel = period === 'month' ? 'last 30 days' : 'last 7 days';
    const sinceIso = new Date(Date.now() - days * DAY_MS).toISOString();
    const wsId = workspace.id;

    // Recipients: workspace admins/owners with an email.
    const { data: members } = await db
      .from('workspace_members')
      .select('role, profiles(email, full_name)')
      .eq('workspace_id', wsId)
      .in('role', ['owner', 'admin']);
    const emails = ((members ?? []) as Array<{ profiles?: { email?: string | null } | null }>)
      .map((m) => m.profiles?.email?.trim())
      .filter((e): e is string => !!e);
    if (emails.length === 0) return { sent: 0, skipped: true };

    // Stats (last 7 days).
    const [leads, converted, conversations, reviews] = await Promise.all([
      countSince(db, 'leads', wsId, sinceIso),
      countSince(db, 'leads', wsId, sinceIso, 'created_at', (q) => q.eq('stage', 'converted')),
      countSince(db, 'conversations', wsId, sinceIso),
      countSince(db, 'gbp_reviews', wsId, sinceIso, 'create_time'),
    ]);

    const rows: Array<[string, string]> = [
      ['New leads', String(leads)],
      ['Leads converted', String(converted)],
      ['New conversations', String(conversations)],
      ['New Google reviews', String(reviews)],
    ];

    const html = renderDigestHtml(workspace.name ?? 'your business', rows, rangeLabel);
    const res = await sendMail({
      to: emails,
      subject: `📊 Your ${periodLabel} report — ${workspace.name ?? 'summary'}`,
      html,
    });
    if (!res.ok) return { sent: 0, skipped: false, error: res.error };
    return { sent: emails.length, skipped: false };
  } catch (err) {
    console.error('[weekly-digest]', err);
    return { sent: 0, skipped: false, error: err instanceof Error ? err.message : 'failed' };
  }
}

function renderDigestHtml(businessName: string, rows: Array<[string, string]>, rangeLabel: string): string {
  const cells = rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #eef2f7;color:#334155;font-size:14px;">${label}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:18px;font-weight:700;text-align:right;">${value}</td>
    </tr>`).join('');
  return `
  <div style="background:#f1f5f9;padding:24px;font-family:Segoe UI,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:#0f172a;padding:20px 24px;color:#fff;">
        <p style="margin:0;font-size:18px;font-weight:800;">${businessName}</p>
        <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Performance report · ${rangeLabel}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">${cells}</table>
      <div style="padding:16px 24px;background:#f8fafc;">
        <p style="margin:0;color:#64748b;font-size:12px;">Open your dashboard to see reviews to reply to, cold leads to re-engage, and more in the Growth Copilot.</p>
      </div>
    </div>
  </div>`;
}
