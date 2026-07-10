import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, refreshSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await refreshSession(token);
  }
  return NextResponse.json({ ok: true });
}
