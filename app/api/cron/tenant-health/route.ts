import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { sendMail } from '@/lib/mailer';
import { classifyTenant, diffNewlySilent, TENANT_HEALTH, type TenantStatus } from '@/lib/tenant-health';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface SnapshotRow {
  workspace_id: string;
  name: string | null;
  phone_number_id: string | null;
  access_token: string | null;
  is_active: boolean;
  last_inbound_at: string | null;
  baseline_count: number;
  recent_count: number;
}
interface Probe {
  token_ok: boolean;
  quality?: string;
  display_phone_number?: string;
  error?: string;
}

async function probeMeta(pnid: string | null, token: string | null): Promise<Probe> {
  if (!pnid || !token) return { token_ok: false, error: 'missing credentials' };
  const clean = token.replace(/﻿/g, '').trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${pnid}?fields=verified_name,display_phone_number,quality_rating`,
      { headers: { Authorization: `Bearer ${clean}` }, signal: controller.signal },
    );
    const body = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      return { token_ok: false, error: `HTTP ${res.status}: ${String(body?.error?.message ?? '').slice(0, 80)}` };
    }
    return { token_ok: true, quality: body.quality_rating, display_phone_number: body.display_phone_number };
  } catch (e) {
    return { token_ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// POST /api/cron/tenant-health — external cron (Bearer CRON_SECRET)
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient() as any;
  const nowIso = new Date().toISOString();

  const { data: snapshot, error } = await db.rpc('get_tenant_health_snapshot');
  if (error) {
    console.error('[tenant-health] snapshot rpc failed:', error);
    return NextResponse.json({ error: 'snapshot failed' }, { status: 500 });
  }
  const rows = (snapshot ?? []) as SnapshotRow[];
  const current = rows.map((r) => ({ workspace_id: r.workspace_id, status: classifyTenant(r), row: r }));

  // Prior state (for transitions). Load notified_at/recovered_at too so we can
  // re-send them unchanged in the upsert (see the homogeneous-keys note below).
  const { data: priorRows } = await db.from('workspace_health').select('workspace_id, status, silent_since, notified_at, recovered_at');
  const prevStatus = new Map<string, TenantStatus>();
  const prevSilentSince = new Map<string, string | null>();
  const prevNotifiedAt = new Map<string, string | null>();
  const prevRecoveredAt = new Map<string, string | null>();
  for (const p of (priorRows ?? []) as Array<{ workspace_id: string; status: TenantStatus; silent_since: string | null; notified_at: string | null; recovered_at: string | null }>) {
    prevStatus.set(p.workspace_id, p.status);
    prevSilentSince.set(p.workspace_id, p.silent_since);
    prevNotifiedAt.set(p.workspace_id, p.notified_at);
    prevRecoveredAt.set(p.workspace_id, p.recovered_at);
  }

  const newlySilentIds = new Set(
    diffNewlySilent(prevStatus, current.map((c) => ({ workspace_id: c.workspace_id, status: c.status }))),
  );

  // Probe only currently-silent tenants (bounded).
  const probes = new Map<string, Probe>();
  for (const c of current) {
    if (c.status === 'silent') probes.set(c.workspace_id, await probeMeta(c.row.phone_number_id, c.row.access_token));
  }

  // Upsert per-tenant health. IMPORTANT: a batch upsert normalizes every row to
  // the UNION of keys and sends null for any key a row omits — so every row MUST
  // carry the SAME columns, or a row missing notified_at/recovered_at would null
  // out that tenant's existing value. Each field is set to its new value on the
  // relevant transition, otherwise to its prior value.
  const upserts = current.map((c) => {
    const wasSilent = prevStatus.get(c.workspace_id) === 'silent';
    const isSilent = c.status === 'silent';
    return {
      workspace_id: c.workspace_id,
      status: c.status,
      last_inbound_at: c.row.last_inbound_at,
      silent_since: isSilent ? (wasSilent ? (prevSilentSince.get(c.workspace_id) ?? nowIso) : nowIso) : null,
      probe: isSilent ? (probes.get(c.workspace_id) ?? {}) : {},
      notified_at: newlySilentIds.has(c.workspace_id) ? nowIso : (prevNotifiedAt.get(c.workspace_id) ?? null),
      recovered_at: (!isSilent && wasSilent) ? nowIso : (prevRecoveredAt.get(c.workspace_id) ?? null),
      updated_at: nowIso,
    };
  });
  if (upserts.length) {
    const { error: upErr } = await db.from('workspace_health').upsert(upserts, { onConflict: 'workspace_id' });
    if (upErr) console.error('[tenant-health] upsert failed:', upErr);
  }

  const silent = current.filter((c) => c.status === 'silent');
  const newlySilent = current.filter((c) => newlySilentIds.has(c.workspace_id));
  const recovered = current.filter((c) => c.status === 'ok' && prevStatus.get(c.workspace_id) === 'silent');

  // Summary row for the existing admin health-reports UI.
  await db.from('platform_health_reports').insert({
    checked_at: nowIso,
    overall_status: silent.length ? 'error' : 'ok',
    checks: { type: 'tenant_health', silent_count: silent.length, ok_count: current.length - silent.length },
    errors: silent.map((c) => ({ workspace: c.row.name, last_inbound_at: c.row.last_inbound_at, probe: probes.get(c.workspace_id) })),
    has_errors: silent.length > 0,
  });

  // Email platform admins — only the newly-silent.
  let emailed = 0;
  if (newlySilent.length > 0) {
    const { data: admins } = await db.from('profiles').select('email').eq('is_platform_admin', true);
    const to = ((admins ?? []) as Array<{ email?: string }>).map((a) => a.email).filter((e): e is string => !!e);
    if (to.length > 0) {
      const rowsHtml = newlySilent.map((c) => {
        const p = probes.get(c.workspace_id);
        const verdict = p?.token_ok
          ? `token OK, quality ${p.quality ?? '?'} → likely webhook/delivery issue`
          : `credential/number problem: ${p?.error ?? 'unknown'} → check & renew`;
        return `<tr><td>${c.row.name ?? c.workspace_id}</td><td>${c.row.last_inbound_at ?? '—'}</td><td>${verdict}</td></tr>`;
      }).join('');
      const html = `<p>${newlySilent.length} tenant(s) went silent — no inbound in ${TENANT_HEALTH.RECENT_HOURS}h despite prior activity:</p>`
        + `<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Tenant</th><th>Last inbound</th><th>Probe</th></tr>${rowsHtml}</table>`;
      const r = await sendMail({ to, subject: `⚠️ ${newlySilent.length} tenant(s) went silent`, html });
      emailed = r.ok ? to.length : 0;
      if (!r.ok) console.error('[tenant-health] email failed:', r.error);
    }
  }

  return NextResponse.json({
    scanned: current.length,
    silent: silent.length,
    newly_silent: newlySilent.length,
    recovered: recovered.length,
    emailed,
  });
}
