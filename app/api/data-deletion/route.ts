import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getRequiredSecret } from '@/lib/supabase-env';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const signedRequest = params.get('signed_request');

    if (!signedRequest) {
      return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 });
    }

    const parts = signedRequest.split('.');
    const encodedSig = parts[0] ?? '';
    const payload = parts[1] ?? '';
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { user_id?: string };
    const userId = data.user_id ?? 'unknown';

    const sig = Buffer.from(encodedSig, 'base64url');
    const expectedSig = crypto
      .createHmac('sha256', getRequiredSecret('META_APP_SECRET'))
      .update(payload, 'utf8')
      .digest();

    if (!crypto.timingSafeEqual(sig, expectedSig)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const confirmationCode = `del_${userId}_${Date.now()}`;

    return NextResponse.json({
      url: `https://whatsapp-automation-kohl-six.vercel.app/data-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'V4TOU Tech Data Deletion Endpoint',
    instructions: 'Send a POST request with signed_request to delete your data.',
  });
}
