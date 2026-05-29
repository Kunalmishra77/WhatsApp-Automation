import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/services/supabase/middleware';

const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/verify-email'];

const ROLE_PROTECTED_ROUTES: Array<{ path: string; allowedRoles: string[] }> = [
  { path: '/settings/billing', allowedRoles: ['super_admin', 'admin'] },
  { path: '/analytics',        allowedRoles: ['super_admin', 'admin', 'manager'] },
  { path: '/campaigns',        allowedRoles: ['super_admin', 'admin', 'manager'] },
  { path: '/team',             allowedRoles: ['super_admin', 'admin', 'manager'] },
];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const response = await updateSession(request);

  const roleHeader = request.cookies.get('agentix-role')?.value;
  if (roleHeader) {
    const restricted = ROLE_PROTECTED_ROUTES.find((r) =>
      pathname.startsWith(r.path)
    );
    if (restricted && !restricted.allowedRoles.includes(roleHeader)) {
      return NextResponse.redirect(new URL('/conversations', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
