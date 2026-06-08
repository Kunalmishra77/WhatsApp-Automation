import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId');
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;
    const { data } = await db.from('wa_forms').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false });
    return NextResponse.json({ forms: data ?? [] });
  } catch (e) {
    if (e instanceof AuthzError) return authzResponse(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      workspaceId: string;
      name: string;
      description?: string;
      questions: unknown[];
      completion_message?: string;
    };
    if (!body.workspaceId || !body.name || !Array.isArray(body.questions)) {
      return NextResponse.json({ error: 'workspaceId, name, questions required' }, { status: 400 });
    }
    await requireWorkspacePermission(body.workspaceId, 'manage_workspace');
    const db = createAdminClient() as any;
    const { data, error } = await db.from('wa_forms').insert({
      workspace_id:       body.workspaceId,
      name:               body.name,
      description:        body.description ?? null,
      questions:          body.questions,
      completion_message: body.completion_message ?? 'Thank you for your response! We will be in touch soon.',
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ form: data }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthzError) return authzResponse(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
