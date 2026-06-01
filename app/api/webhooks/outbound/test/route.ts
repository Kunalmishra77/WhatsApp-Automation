import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse } from '@/lib/authz';

export const maxDuration = 15;

// POST /api/webhooks/outbound/test — send a test ping to an endpoint
export async function POST(request: NextRequest) {
  try {
    const { workspaceId, endpointId } = await request.json() as {
      workspaceId?: string;
      endpointId?: string;
    };

    if (!workspaceId || !endpointId) {
      return NextResponse.json({ error: 'workspaceId and endpointId required' }, { status: 400 });
    }

    await requireWorkspacePermission(workspaceId, 'manage_workspace');

    const db = createAdminClient() as any;
    const { data: ep } = await db
      .from('webhook_endpoints')
      .select('url, secret')
      .eq('id', endpointId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!ep) return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });

    const payload = {
      event: 'test',
      workspace_id: workspaceId,
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test delivery from Agentix. Your webhook is working!' },
    };
    const body = JSON.stringify(payload);

    let statusCode: number | null = null;
    let success = false;
    let error: string | null = null;

    try {
      const res = await fetch(ep.url as string, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agentix-Event': 'test',
          'User-Agent': 'Agentix-Webhooks/1.0',
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      statusCode = res.status;
      success = res.ok;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Connection failed';
    }

    return NextResponse.json({ success, statusCode, error });
  } catch (error) {
    return authzResponse(error);
  }
}
