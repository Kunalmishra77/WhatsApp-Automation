import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/services/supabase/admin';
import { normalizePhone } from '@/lib/phone';
import { recordTouchpoint } from '@/lib/lead-touchpoint';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/referrals/capture  (PUBLIC)
// Body: { code, name, phone } — a referred person signing up via a referral link.
export async function POST(request: NextRequest) {
  try {
    const { code, name, phone } = await request.json() as { code?: string; name?: string; phone?: string };
    if (!code?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: 'Referral code and phone are required' }, { status: 400 });
    }

    const db = createAdminClient() as any;
    const { data: ref } = await db
      .from('referral_codes')
      .select('workspace_id, contact_id')
      .eq('code', code.trim().toUpperCase())
      .maybeSingle();
    if (!ref) return NextResponse.json({ error: 'Invalid referral link' }, { status: 404 });

    const workspaceId = ref.workspace_id as string;
    const normPhone = normalizePhone(phone.trim());
    if (!normPhone) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });

    // Create/find the referred contact.
    const { data: contact } = await db
      .from('contacts')
      .upsert(
        { workspace_id: workspaceId, phone: normPhone, name: name?.trim() || null, channel: 'referral', source_detail: 'Referral' },
        { onConflict: 'workspace_id,phone', ignoreDuplicates: false },
      )
      .select('id')
      .single();

    // Record the referral event.
    await db.from('referrals').insert({
      workspace_id: workspaceId,
      referrer_contact_id: ref.contact_id,
      referred_contact_id: contact?.id ?? null,
      referred_name: name?.trim() || null,
      referred_phone: normPhone,
      code: code.trim().toUpperCase(),
      status: 'joined',
    });

    // Attribute the referred contact to the referral channel.
    if (contact?.id) {
      await recordTouchpoint(db, {
        workspaceId,
        contactId: contact.id as string,
        channel: 'referral',
        sourceDetail: 'Referral program',
        refType: 'manual',
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[referral capture]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
