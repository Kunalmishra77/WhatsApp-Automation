import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { normalizePhone } from '@/lib/phone';

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

    // Enforce contact limit
    try {
      const { getWorkspacePlan, guardContactLimit } = await import('@/lib/plan-guard');
      const wsPlan = await getWorkspacePlan(workspaceId);
      await guardContactLimit(workspaceId, wsPlan);
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'PlanLimitError') {
        return NextResponse.json({ error: (e as Error).message, code: 'PLAN_LIMIT_EXCEEDED' }, { status: 402 });
      }
    }

    // Normalize phone numbers — strip non-digits, add country code if needed
    // Use String() to handle cases where phone arrives as a number (large numbers in CSV/JSON)
    const rows = contacts
      .filter((c) => String(c.phone ?? '').trim())
      .map((c) => ({
        workspace_id: workspaceId,
        phone:  normalizePhone(String(c.phone ?? '').trim()),
        name:   c.name ? String(c.name).trim() || null : null,
        email:  c.email ? String(c.email).trim() || null : null,
        tags:   Array.isArray(c.tags) ? c.tags.filter(Boolean) : [],
        notes:  c.notes ? String(c.notes).trim() || null : null,
      }))
      .filter((r) => r.phone.length >= 7);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid contacts to import' }, { status: 400 });
    }

    const db = createAdminClient() as any;

    // Use ignoreDuplicates: true — skip existing contacts (preserves their name/email/tags)
    // Only newly inserted rows are returned by .select()
    const BATCH = 250;
    let inserted = 0;
    let failed = 0;
    let lastError = '';

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { data, error } = await db
        .from('contacts')
        .upsert(batch, { onConflict: 'workspace_id,phone', ignoreDuplicates: true })
        .select('id');

      if (error) {
        console.error('[Import] Batch error:', error.message, JSON.stringify(error));
        failed += batch.length;
        lastError = error.message;
      } else {
        const batchInserted = data?.length ?? 0;
        inserted += batchInserted;
        if (batchInserted > 0) {
          void import('@/lib/usage-tracker').then(({ trackContactCreated }) => trackContactCreated(workspaceId)).catch(() => {});
        }
      }
    }

    const skipped = rows.length - inserted - failed;

    return NextResponse.json({
      total: rows.length,
      inserted,
      skipped,
      failed,
      ...(lastError ? { lastError } : {}),
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[Import] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
