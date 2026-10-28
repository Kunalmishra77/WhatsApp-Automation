// lib/lead-upsert.ts
//
// Creating the one lead a contact is allowed to have, safely.
//
// Three places created leads automatically — the WhatsApp webhook's auto-lead
// path, the in-chat form handler, and the Google Ads lead webhook — and each did
// its own "does one exist?" check followed by an insert. Nothing guarded the gap
// between the two, so when several events for the same contact arrived together
// they all passed the check and all inserted. 222 contacts ended up with more
// than one lead, one with five, 219 of those groups created inside ten seconds.
//
// Migration 129 deduplicates and adds a unique index on
// (workspace_id, contact_id). That makes the race impossible — and makes a plain
// insert raise on the loser, which is why every caller goes through here.

export interface LeadUpsertResult {
  /** The lead this contact has, whether this call created it or not. */
  id: string | null;
  /** True only when this call inserted the row. */
  created: boolean;
}

interface MinimalDb {
  from(table: string): any;
}

/**
 * Inserts a lead unless the contact already has one, and returns the id either
 * way so the caller can attach touchpoints to the right row.
 *
 * `created` is what callers should branch on for anything that must happen once
 * per lead. Under a race exactly one call gets `created: true`, so a
 * notification or an attribution touchpoint fires once rather than twice.
 */
export async function upsertLead(
  db: MinimalDb,
  payload: Record<string, unknown>,
): Promise<LeadUpsertResult> {
  const workspaceId = payload.workspace_id;
  const contactId = payload.contact_id;

  const { data, error } = await db
    .from('leads')
    .upsert(payload, {
      onConflict: 'workspace_id,contact_id',
      // DO NOTHING rather than overwrite: the existing row may carry a stage
      // somebody set by hand, a score the classifier worked out, or an
      // assignment. A second inbound message must not reset any of that.
      ignoreDuplicates: true,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[upsertLead] insert failed:', error.message);
  } else if (data?.id) {
    return { id: data.id as string, created: true };
  }

  // Either the contact already had a lead, or this call lost the race. Find the
  // row that exists so the caller still has something to attach to.
  const { data: existing } = await db
    .from('leads')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .limit(1)
    .maybeSingle();

  return { id: (existing?.id as string | undefined) ?? null, created: false };
}

/** Postgres unique-violation. Surfaced to users as a sentence, not a 500. */
export const UNIQUE_VIOLATION = '23505';

export function isDuplicateLeadError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === UNIQUE_VIOLATION || /leads_workspace_contact_unique/.test(error.message ?? '');
}
