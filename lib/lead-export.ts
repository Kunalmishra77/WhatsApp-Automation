// Pure helpers for bulk lead export (CSV / Excel), shared by the export endpoint.

export const LEAD_EXPORT_HEADERS = [
  'Contact Name', 'Phone', 'Temperature', 'Stage', 'Priority', 'Source',
  'Value', 'Currency', 'Tags', 'Assigned Agent', 'Follow-up At', 'Created At', 'Last Activity',
] as const;

type Temperature = 'hot' | 'warm' | 'cold';

export interface LeadRecord {
  temperature?: string | null; // lives on leads (hot|warm|cold), trigger-maintained
  stage?: string | null;
  priority?: string | null;
  source?: string | null;
  value?: number | string | null;
  currency?: string | null;
  tags?: string[] | null;
  follow_up_at?: string | null;
  created_at?: string | null;
  contacts?: { name?: string | null; phone?: string | null } | null;
  profiles?: { full_name?: string | null; email?: string | null } | null;
  conversations?: { last_message_at?: string | null } | null;
}

/** Validates the temperature filter param. `all`/null/unknown → null (no filter). */
export function parseTemperature(param: string | null | undefined): Temperature | null {
  const t = (param ?? '').toLowerCase();
  return t === 'hot' || t === 'warm' || t === 'cold' ? t : null;
}

/** Maps one joined lead record to a row in LEAD_EXPORT_HEADERS order (all strings). */
export function leadToRow(lead: LeadRecord): string[] {
  return [
    lead.contacts?.name ?? '',
    lead.contacts?.phone ?? '',
    lead.temperature ?? 'warm',
    lead.stage ?? '',
    lead.priority ?? '',
    lead.source ?? '',
    lead.value != null && lead.value !== '' ? String(lead.value) : '',
    lead.currency ?? '',
    Array.isArray(lead.tags) ? lead.tags.join(', ') : '',
    lead.profiles?.full_name ?? lead.profiles?.email ?? 'Unassigned',
    lead.follow_up_at ?? '',
    lead.created_at ?? '',
    lead.conversations?.last_message_at ?? '',
  ];
}

/** CSV with every cell wrapped and internal quotes doubled. */
export function rowsToCsv(headers: readonly string[], rows: string[][]): string {
  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  return [headers.map(esc), ...rows.map((r) => r.map(esc))].map((r) => r.join(',')).join('\n');
}
