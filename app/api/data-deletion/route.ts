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

    const parts = signedRequest.split('.');
    const encodedSig = parts[0] ?? '';
    const payload = parts[1] ?? '';
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { user_id?: string };
    const userId = data.user_id ?? 'unknown';

    // Verify signature only if META_APP_SECRET is configured (platform-level GDPR endpoint)
    const metaAppSecret = process.env.META_APP_SECRET;
    if (metaAppSecret) {
      const sig = Buffer.from(encodedSig, 'base64url');
      const expectedSig = crypto
        .createHmac('sha256', metaAppSecret)
        .update(payload, 'utf8')
        .digest();
      if (!crypto.timingSafeEqual(sig, expectedSig)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const confirmationCode = `del_${userId}_${Date.now()}`;

    return NextResponse.json({
      url: `https://app.aiagentixdev.com/data-deletion?code=${confirmationCode}`,
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
