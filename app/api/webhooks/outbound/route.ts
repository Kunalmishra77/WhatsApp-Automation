import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';
import { dispatchWebhookEvent, type WebhookEvent } from '@/lib/outbound-webhook';

const VALID_EVENTS: WebhookEvent[] = [
  'message.received',
  'conversation.created',
  'conversation.resolved',
  'contact.created',
  'campaign.completed',
];

// GET /api/webhooks/outbound?workspaceId=
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: endpoints } = await db
      .from('webhook_endpoints')
      .select('id, name, url, events, is_active, last_triggered_at, failure_count, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    // Fetch recent deliveries count per endpoint
    return NextResponse.json({ endpoints: endpoints ?? [] });
  } catch (error) {
    return authzResponse(error);
  }
}

// POST /api/webhooks/outbound — create endpoint
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, name, url, secret, events } = await request.json() as {
      workspaceId?: string;
      name?: string;
      url?: string;
      secret?: string;
      events?: string[];
    };

    if (!workspaceId || !name?.trim() || !url?.trim()) {
      return NextResponse.json({ error: 'workspaceId, name, and url are required' }, { status: 400 });
    }

    // Validate URL
    try { new URL(url); } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Validate events
    const validatedEvents = (events ?? []).filter((e): e is WebhookEvent =>
      VALID_EVENTS.includes(e as WebhookEvent),
    );

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('webhook_endpoints')
      .insert({
        workspace_id: workspaceId,
        name: name.trim(),
        url: url.trim(),
        secret: secret?.trim() ?? null,
        events: validatedEvents,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ endpoint: data });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return authzResponse(error);
  }
}

// PATCH /api/webhooks/outbound — update endpoint
export async function PATCH(request: NextRequest) {
  try {
    const { id, workspaceId, name, url, secret, events, isActive } = await request.json() as {
      id?: string;
      workspaceId?: string;
      name?: string;
      url?: string;
      secret?: string;
      events?: string[];
      isActive?: boolean;
    };

    if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name?.trim();
    if (url !== undefined) updates.url = url?.trim();
    if (secret !== undefined) updates.secret = secret?.trim() || null;
    if (events !== undefined) updates.events = events.filter((e) => VALID_EVENTS.includes(e as WebhookEvent));
    if (isActive !== undefined) { updates.is_active = isActive; updates.failure_count = 0; }

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('webhook_endpoints')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ endpoint: data });
  } catch (error) {
    return authzResponse(error);
  }
}

// DELETE /api/webhooks/outbound?id=&workspaceId=
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!id || !workspaceId) return NextResponse.json({ error: 'id and workspaceId required' }, { status: 400 });

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    await db.from('webhook_endpoints').delete().eq('id', id).eq('workspace_id', workspaceId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return authzResponse(error);
  }
}
