import { type NextRequest, NextResponse } from 'next/server';
import { sendMail } from '@/lib/mailer';
import { checkApiLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const CONTACT_INBOX = 'support@agentix.in';
const MAX_FIELD_LENGTH = 5000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// POST /api/marketing/contact
// Body: { name, email, message }
// Lightweight, unauthenticated endpoint behind the public marketing site's contact form.
// No DB write — just relays the submission to support@agentix.in via the shared mailer.
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { success } = await checkApiLimit(`marketing-contact:${ip}`);
    if (!success) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests. Please try again in a minute.' },
        { status: 429 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { name?: string; email?: string; message?: string }
      | null;

    if (!body) {
      return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
    }

    const name = body.name?.trim() ?? '';
    const email = body.email?.trim() ?? '';
    const message = body.message?.trim() ?? '';

    if (!name || !email || !message) {
      return NextResponse.json(
        { ok: false, error: 'Name, email, and message are all required.' },
        { status: 400 },
      );
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (name.length > MAX_FIELD_LENGTH || email.length > MAX_FIELD_LENGTH || message.length > MAX_FIELD_LENGTH) {
      return NextResponse.json({ ok: false, error: 'One of the fields is too long.' }, { status: 400 });
    }

    const html = `
      <div style="font-family: sans-serif; font-size: 14px; color: #0f1e38;">
        <h2 style="margin: 0 0 16px;">New contact form submission</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
      </div>
    `;

    const { ok, error } = await sendMail({
      to: CONTACT_INBOX,
      subject: `AGENTiX contact form — ${name}`,
      html,
    });

    if (!ok) {
      console.error('[MarketingContact] sendMail failed', error);
      return NextResponse.json({ ok: false, error: 'Failed to send your message. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[MarketingContact]', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
