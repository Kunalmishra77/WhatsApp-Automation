import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/session';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t');
  const next  = request.nextUrl.searchParams.get('next') ?? '/conversations';

  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.redirect(new URL('/conversations', request.url));
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
  return response;
}
