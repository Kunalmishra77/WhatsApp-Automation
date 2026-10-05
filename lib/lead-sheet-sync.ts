import { createAdminClient } from '@/services/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

// One-row-per-lead Google Sheet sync (Phase 3).
//
// Consistent with the existing conversation-log sync (lib/sheets-notify.ts): the
// workspace configures a Google Apps Script web-app URL and we POST to it. The key
// difference is the UPSERT contract — every payload carries a stable `lead_id`, so
// the Apps Script updates that lead's existing row instead of appending a new one.
// That makes the sheet a live mirror of the CRM (one row per lead, always current)
// rather than an append-only event log.
//
// Settings key: `leads_sheet_webhook_url` — DEDICATED, no fallback. We deliberately
// do NOT reuse the shared `sheets_webhook_url` (used by VMS/Razorveda for the
// conversation log): that Apps Script only understands conversation payloads, so
// posting lead rows to it would append malformed rows. A workspace must explicitly
// connect a Leads sheet, so nothing fires until the operator opts in.
//
// Fire-and-forget: callers invoke without awaiting and the function never throws.
export async function syncLeadToSheet(
  supabase: AdminClient,
  workspaceId: string,
  leadId: string,
): Promise<void> {
  try {
    const db = supabase as any;

    // Cheap gate first: skip everything if no sheet is configured (the common case).
    const { data: ws } = await db
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single();
    const settings = (ws?.settings as Record<string, unknown> | null) ?? {};
    const webhookUrl = settings.leads_sheet_webhook_url as string | undefined;
    if (!webhookUrl || typeof webhookUrl !== 'string') return;

    const { data: lead } = await db
      .from('leads')
      .select('id, stage, ai_score, temperature, score_signals, source, created_at, updated_at, contacts(name, phone)')
      .eq('id', leadId)
      .eq('workspace_id', workspaceId)
      .single();
    if (!lead) return;

    const contact = (lead.contacts ?? {}) as { name?: string | null; phone?: string | null };
    const signals = Array.isArray(lead.score_signals)
      ? (lead.score_signals as string[]).join('; ')
      : '';

    const payload: Record<string, string> = {
      row_type:    'lead',
      lead_id:     String(lead.id),          // stable upsert key
      name:        contact.name ?? '',
      phone:       contact.phone ?? '',
      stage:       lead.stage ?? '',
      temperature: lead.temperature ?? '',
      score:       lead.ai_score != null ? String(lead.ai_score) : '',
      signals,
      source:      lead.source ?? '',
      created_at:  lead.created_at
        ? new Date(lead.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        : '',
      updated_at:  new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // non-critical — never let a sheet-sync failure affect classification
  }
}
