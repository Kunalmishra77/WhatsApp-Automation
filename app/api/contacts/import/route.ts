import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

interface ContactRow {
  name?: string;
  phone: string;
  email?: string;
  tags?: string[];
  notes?: string;
}

// POST /api/contacts/import
// Body: { workspaceId, contacts: ContactRow[] }
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, contacts } = await request.json() as {
      workspaceId?: string;
      contacts?: ContactRow[];
    };

    if (!workspaceId || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: 'workspaceId and contacts[] required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_contacts');

    // Normalize phone numbers — strip non-digits, add country code if needed
    const rows = contacts
      .filter((c) => c.phone?.trim())
      .map((c) => ({
        workspace_id: workspaceId,
        phone:  normalizePhone(c.phone),
        name:   c.name?.trim() || null,
        email:  c.email?.trim() || null,
        tags:   Array.isArray(c.tags) ? c.tags.filter(Boolean) : [],
        notes:  c.notes?.trim() || null,
      }))
      .filter((r) => r.phone);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid contacts to import' }, { status: 400 });
    }

    const db = createAdminClient() as any;

    // Upsert in batches of 100
    const BATCH = 100;
    let inserted = 0;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { data, error } = await db
        .from('contacts')
        .upsert(batch, { onConflict: 'workspace_id,phone', ignoreDuplicates: false })
        .select('id');

      if (error) {
        console.error('[Import] Batch error:', error.message);
        failed += batch.length;
      } else {
        const batchInserted = data?.length ?? 0;
        inserted += batchInserted;
        if (batchInserted > 0) {
          void import('@/lib/usage-tracker').then(({ trackContactCreated }) => trackContactCreated(workspaceId)).catch(() => {});
        }
      }
    }

    return NextResponse.json({
      total: rows.length,
      inserted,
      failed,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Import] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function normalizePhone(raw: string): string {
  // Strip everything except digits and leading +
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  // If starts with +, keep as is
  if (cleaned.startsWith('+')) return cleaned;
  // If 10 digits (Indian), add +91
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  // If starts with 91 and 12 digits total
  if (/^91\d{10}$/.test(cleaned)) return `+${cleaned}`;
  // Otherwise prefix +
  return `+${cleaned}`;
}
