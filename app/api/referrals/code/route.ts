import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/services/supabase/admin';
import { requireWorkspacePermission, authzResponse, AuthzError } from '@/lib/authz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function genCode(): string {
  return crypto.randomBytes(5).toString('hex').slice(0, 8).toUpperCase(); // 8 hex chars
}

// GET /api/referrals/code?workspaceId=&contactId=
// Returns (creating on first call) the contact's referral code + share link.
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const workspaceId = sp.get('workspaceId');
    const contactId = sp.get('contactId');
    if (!workspaceId || !contactId) return NextResponse.json({ error: 'workspaceId and contactId required' }, { status: 400 });
    await requireWorkspacePermission(workspaceId, 'manage_contacts');

    const db = createAdminClient() as any;
    let { data: row } = await db
      .from('referral_codes')
      .select('code')
      .eq('workspace_id', workspaceId)
      .eq('contact_id', contactId)
      .maybeSingle();

    if (!row) {
      for (let attempt = 0; attempt < 5 && !row; attempt++) {
        const { data: created, error } = await db
          .from('referral_codes')
          .insert({ workspace_id: workspaceId, contact_id: contactId, code: genCode() })
          .select('code')
          .single();
        if (!error) row = created;
      }
    }
    if (!row) return NextResponse.json({ error: 'Could not create code' }, { status: 500 });

    const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const link = `${base}/r/${row.code}`;
    return NextResponse.json({
      code: row.code,
      link,
      shareMessage: `Hi! I love this business — join using my referral link and we both get a reward 🎁 ${link}`,
    });
  } catch (error) {
    if (error instanceof AuthzError) return authzResponse(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
