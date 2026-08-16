import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { LEAD_EXPORT_HEADERS, leadToRow, parseTemperature, type LeadRecord } from '@/lib/lead-export';
import { paginateAll, exportResponse } from '@/lib/export-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELECT = `
  temperature, stage, priority, source, value, currency, tags, follow_up_at, created_at, ai_score,
  contacts(name, phone),
  profiles:assigned_agent_id(full_name, email),
  conversations(last_message_at)
`;

// GET /api/leads/export?workspaceId=&temperature=all|hot|warm|cold&stage=&assigned_agent=&source=&from=&to=&format=csv
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    const temperature = parseTemperature(sp.get('temperature'));
    const stage = sp.get('stage');
    const assignedAgent = sp.get('assigned_agent');
    const source = sp.get('source');
    const from = sp.get('from');
    const to = sp.get('to');
    const forceCsv = sp.get('format') === 'csv';

    const applyFilters = (q: any) => {
      q = q.eq('workspace_id', workspaceId);
      if (temperature) q = q.eq('temperature', temperature);
      if (stage) q = q.eq('stage', stage);
      if (assignedAgent) q = q.eq('assigned_agent_id', assignedAgent);
      if (source) q = q.eq('source', source);
      if (from) q = q.gte('created_at', `${from}T00:00:00.000Z`);
      if (to) q = q.lte('created_at', `${to}T23:59:59.999Z`);
      return q;
    };

    const { count, error: countErr } = await applyFilters(
      db.from('leads').select('*', { count: 'exact', head: true }),
    );
    if (countErr) {
      console.error('[LeadExport count]', countErr);
      return NextResponse.json({ error: 'Failed to count leads' }, { status: 500 });
    }

    const pages = paginateAll<LeadRecord>((offset, pageSize) =>
      applyFilters(db.from('leads').select(SELECT))
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
    );

    const tag = temperature ?? 'all';
    const dateTag = new Date().toISOString().slice(0, 10);
    return await exportResponse<LeadRecord>({
      count: count ?? 0,
      forceCsv,
      headers: [...LEAD_EXPORT_HEADERS],
      pages,
      mapRow: (lead) => leadToRow(lead),
      filenameBase: `leads_${tag}_${dateTag}`,
      sheetName: 'Leads',
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[LeadExport GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
