import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const signedRequest = params.get('signed_request');

    if (!signedRequest) {
      return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 });
    }

    const [encodedSig, payload] = signedRequest.split('.');
    const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    const userId = data.user_id ?? 'unknown';

    const sig = Buffer.from(encodedSig, 'base64');
    const expectedSig = crypto
      .createHmac('sha256', process.env.META_APP_SECRET!)
      .update(payload)
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
