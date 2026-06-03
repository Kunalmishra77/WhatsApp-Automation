import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { authzResponse, requireWorkspacePermission } from '@/lib/authz';

interface MetaComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: unknown[];
}

interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: MetaComponent[];
}

interface MetaTemplatesResponse {
  data?: MetaTemplate[];
  error?: { message?: string };
}

function extractFromComponents(components: MetaComponent[] = []) {
  let header_type:    string | null = null;
  let header_content: string | null = null;
  let body = '';
  let footer: string | null = null;
  const buttons: unknown[] = [];
  const variables: string[] = [];

  for (const c of components) {
    switch (c.type.toUpperCase()) {
      case 'HEADER': {
        const fmt = c.format?.toUpperCase() ?? 'NONE';
        header_type = fmt;
        if (fmt === 'TEXT') {
          header_content = c.text ?? null;
        } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(fmt)) {
          // Store the example media handle if present (used during template submission)
          const example = (c as unknown as Record<string, unknown>).example as Record<string, string[]> | undefined;
          header_content = example?.header_handle?.[0] ?? null;
        }
        break;
      }
      case 'BODY': {
        body = c.text ?? '';
        const matches = body.match(/\{\{(\d+)\}\}/g) ?? [];
        variables.push(...[...new Set(matches)]);
        break;
      }
      case 'FOOTER':
        footer = c.text ?? null;
        break;
      case 'BUTTONS':
        if (c.buttons) buttons.push(...c.buttons);
        break;
    }
  }

  return { header_type, header_content, body, footer, buttons, variables };
}

function normalizeCategory(cat: string): 'authentication' | 'marketing' | 'utility' {
  const map: Record<string, 'authentication' | 'marketing' | 'utility'> = {
    AUTHENTICATION: 'authentication',
    MARKETING: 'marketing',
    UTILITY: 'utility',
  };
  return map[cat.toUpperCase()] ?? 'utility';
}

function normalizeStatus(s: string): 'pending' | 'approved' | 'rejected' | 'paused' {
  const map: Record<string, 'pending' | 'approved' | 'rejected' | 'paused'> = {
    PENDING:   'pending',
    APPROVED:  'approved',
    REJECTED:  'rejected',
    PAUSED:    'paused',
    IN_REVIEW: 'pending',
    FLAGGED:   'paused',
    DISABLED:  'rejected',
  };
  return map[s.toUpperCase()] ?? 'pending';
}

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await request.json() as { workspaceId?: string };
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_templates');

    const admin  = createAdminClient();
    const db     = admin as any;

    const { data: workspace } = await db
      .from('workspaces')
      .select('waba_id, access_token')
      .eq('id', workspaceId)
      .single();

    const wabaId      = workspace?.waba_id      ?? process.env.WHATSAPP_WABA_ID;
    const accessToken = workspace?.access_token ?? process.env.WHATSAPP_ACCESS_TOKEN;

    if (!wabaId || !accessToken) {
      return NextResponse.json({ error: 'Missing WABA ID or access token' }, { status: 400 });
    }

    // Fetch all templates from Meta (handle pagination)
    const allTemplates: MetaTemplate[] = [];
    let url: string | null =
      `https://graph.facebook.com/v19.0/${wabaId}/message_templates` +
      `?fields=name,status,category,language,components&limit=100` +
      `&access_token=${accessToken.replace(/﻿/g, '').trim()}`;

    while (url) {
      const res = await fetch(url);
      const json = await res.json() as MetaTemplatesResponse & { paging?: { next?: string } };
      if (!res.ok) {
        return NextResponse.json({ error: json?.error?.message ?? 'Meta API error' }, { status: 502 });
      }
      allTemplates.push(...(json.data ?? []));
      url = json.paging?.next ?? null;
    }

    let synced = 0;
    let updated = 0;

    for (const mt of allTemplates) {
      const { header_type, header_content, body, footer, buttons, variables } = extractFromComponents(mt.components);
      if (!body) continue; // skip templates with no body

      const record = {
        workspace_id:   workspaceId,
        name:           mt.name,
        status:         normalizeStatus(mt.status),
        category:       normalizeCategory(mt.category),
        language:       mt.language ?? 'en',
        header_type,
        header_content,
        body,
        footer,
        buttons,
        variables,
        updated_at:     new Date().toISOString(),
      };

      // Check if already exists
      const { data: existing } = await db
        .from('templates')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('name', mt.name)
        .eq('language', mt.language ?? 'en')
        .maybeSingle();

      if (existing?.id) {
        await db.from('templates').update(record).eq('id', existing.id);
        updated++;
      } else {
        await db.from('templates').insert(record);
        synced++;
      }
    }

    return NextResponse.json({
      success: true,
      total:   allTemplates.length,
      new:     synced,
      updated,
    });
  } catch (error) {
    if (error instanceof Error && error.message !== 'Internal server error') {
      return authzResponse(error);
    }
    console.error('[TemplateSync] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
