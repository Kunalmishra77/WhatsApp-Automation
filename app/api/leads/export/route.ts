import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import * as XLSX from 'xlsx';
import { LEAD_EXPORT_HEADERS, leadToRow, parseTemperature, rowsToCsv, type LeadRecord } from '@/lib/lead-export';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/leads/export?workspaceId=&format=csv|xlsx&temperature=all|hot|warm|cold
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    const format = (sp.get('format') ?? 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx';
    const temperature = parseTemperature(sp.get('temperature'));

    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'view_analytics');

    const db = createAdminClient() as any;
    let q = db
      .from('leads')
      .select(`
        temperature, stage, priority, source, value, currency, tags, follow_up_at, created_at,
        contacts(name, phone),
        profiles:assigned_agent_id(full_name, email),
        conversations(last_message_at)
      `)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(10000);
    if (temperature) q = q.eq('temperature', temperature);

    const { data, error } = await q;
    if (error) {
      console.error('[LeadExport]', error);
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
    }

    const rows = ((data ?? []) as LeadRecord[]).map(leadToRow);
    const tag = temperature ?? 'all';
    const dateTag = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const csv = rowsToCsv(LEAD_EXPORT_HEADERS, rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="leads_${tag}_${dateTag}.csv"`,
        },
      });
    }

    // xlsx
    const aoa = [LEAD_EXPORT_HEADERS as unknown as string[], ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = LEAD_EXPORT_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="leads_${tag}_${dateTag}.xlsx"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    console.error('[LeadExport GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
