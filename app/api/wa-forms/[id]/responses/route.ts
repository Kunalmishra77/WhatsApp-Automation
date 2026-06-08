import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

// GET /api/wa-forms/[id]/responses
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = createAdminClient() as any;
    const { data: form } = await db.from('wa_forms').select('workspace_id, name, questions').eq('id', id).single();
    if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await requireWorkspacePermission(form.workspace_id as string, 'manage_settings');
    const { data: responses } = await db
      .from('wa_form_responses')
      .select('*')
      .eq('form_id', id)
      .order('submitted_at', { ascending: false })
      .limit(500);
    return NextResponse.json({ form, responses: responses ?? [] });
  } catch (e) {
    if (e instanceof AuthzError) return authzResponse(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
