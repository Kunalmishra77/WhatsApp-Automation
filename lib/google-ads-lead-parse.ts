// lib/google-ads-lead-parse.ts
// Pure parser for Google Ads Lead Form webhook payloads. Google posts the lead
// as `user_column_data` — an array of { column_id, column_name, string_value }.
// We map the standard columns to name/email/phone; kept pure for unit testing.

export interface AdsColumn {
  column_id?: string;
  column_name?: string;
  string_value?: string;
}

export interface ParsedAdsLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  extra: Record<string, string>;
}

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '_');

export function extractLeadFields(columns: AdsColumn[] | undefined | null): ParsedAdsLead {
  const out: ParsedAdsLead = { name: null, email: null, phone: null, extra: {} };
  if (!Array.isArray(columns)) return out;

  for (const c of columns) {
    const val = (c.string_value ?? '').trim();
    if (!val) continue;
    const key = norm(c.column_id) || norm(c.column_name);

    if (!out.name && (key === 'full_name' || key === 'name' || key === 'first_name')) out.name = val;
    else if (!out.email && (key === 'email' || key.includes('email'))) out.email = val;
    else if (!out.phone && (key === 'phone_number' || key === 'phone' || key.includes('phone'))) out.phone = val;
    else if (key === 'last_name' && out.name) out.name = `${out.name} ${val}`.trim();
    else out.extra[c.column_name ?? c.column_id ?? key] = val;
  }
  return out;
}
