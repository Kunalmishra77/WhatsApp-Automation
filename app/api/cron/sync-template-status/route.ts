import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';

export const runtime = 'nodejs';

// GET /api/cron/sync-template-status?secret=<CRON_SECRET>
//
// Brings Meta's approval decisions back on its own.
//
// Nothing did. /api/templates/sync needs a signed-in user with
// manage_templates, so it only ran when somebody opened the Templates page,
// and there was no scheduled job for templates among the twenty-one crons.
// A template submitted on Tuesday stayed 'pending' in the platform until
// someone happened to look — which is most of why clients believed the
// platform could not get a template approved.
//
// Deliberately narrower than /api/templates/sync: that route re-imports each
// template's full content and sweeps away ones Meta no longer has, which needs
// a user's judgement about their own workspace. This only carries a decision
// back — status, Meta's id, and a rejection reason when there is one — and
// touches no other column. It cannot delete anything.

interface MetaTemplate {
  id: string;
  name: string;
  language?: string;
  status: string;
  rejected_reason?: string;
}

function normalizeStatus(metaStatus: string): string {
  const s = metaStatus.toUpperCase();
  if (s === 'APPROVED') return 'approved';
  if (s === 'REJECTED') return 'rejected';
  if (s === 'PAUSED' || s === 'DISABLED') return 'paused';
  return 'pending';
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient() as any;
  let workspacesChecked = 0;
  let updated = 0;
  const failures: string[] = [];

  try {
    const { data: workspaces } = await db
      .from('workspaces')
      .select('id, name, waba_id, access_token')
      .eq('is_active', true)
      .not('waba_id', 'is', null);

    for (const ws of (workspaces ?? []) as Array<Record<string, string>>) {
      const token = (ws.access_token ?? process.env.WHATSAPP_ACCESS_TOKEN ?? '')
        .replace(/﻿/g, '')
        .trim();
      if (!token) continue;

      workspacesChecked++;

      try {
        // Only the fields a decision needs, and only templates this workspace
        // has locally are acted on below.
        const metaTemplates: MetaTemplate[] = [];
        let url: string | null =
          `https://graph.facebook.com/v19.0/${ws.waba_id}/message_templates` +
          `?fields=name,status,language,rejected_reason&limit=100` +
          `&access_token=${encodeURIComponent(token)}`;

        while (url) {
          const res = await fetch(url);
          const json = (await res.json()) as {
            data?: MetaTemplate[];
            paging?: { next?: string };
            error?: { message?: string };
          };
          if (!res.ok) throw new Error(json?.error?.message ?? `Meta returned ${res.status}`);
          metaTemplates.push(...(json.data ?? []));
          url = json.paging?.next ?? null;
        }

        const { data: locals } = await db
          .from('templates')
          .select('id, name, language, status, meta_template_id')
          .eq('workspace_id', ws.id)
          .neq('status', 'deleted');

        for (const local of (locals ?? []) as Array<Record<string, string | null>>) {
          // Match on Meta's id once we have it, falling back to name and
          // language — which is all the platform had before this.
          const match = metaTemplates.find((m) =>
            local.meta_template_id
              ? m.id === local.meta_template_id
              : m.name === local.name && (!local.language || m.language === local.language),
          );
          if (!match) continue;

          const status = normalizeStatus(match.status);
          const needsStatus = status !== local.status;
          const needsId = !local.meta_template_id;
          if (!needsStatus && !needsId) continue;

          const patch: Record<string, unknown> = {
            meta_template_id: match.id,
            updated_at: new Date().toISOString(),
          };
          if (needsStatus) patch.status = status;
          // Meta only sends a reason on rejection, and a client needs to see it
          // to fix the template.
          if (status === 'rejected' && match.rejected_reason) {
            patch.rejection_reason = match.rejected_reason;
          }

          const { error } = await db.from('templates').update(patch).eq('id', local.id);
          if (error) {
            // A column this build does not have must not stop the other
            // workspaces from syncing.
            console.error(`[TemplateStatusSync] ${ws.name}/${local.name}:`, error.message);
          } else if (needsStatus) {
            updated++;
            console.log(`[TemplateStatusSync] ${ws.name}: ${local.name} ${local.status} -> ${status}`);
          }
        }
      } catch (err) {
        // One workspace's expired token must not end the run.
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${ws.name}: ${message}`);
        console.error(`[TemplateStatusSync] ${ws.name} failed:`, message);
      }
    }

    return NextResponse.json({ success: true, workspacesChecked, updated, failures });
  } catch (err) {
    console.error('[TemplateStatusSync] run failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
