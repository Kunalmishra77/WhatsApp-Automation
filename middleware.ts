import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { ROUTES } from '@/lib/constants';

const PUBLIC_ROUTES = [
  ROUTES.LOGIN,
  ROUTES.SIGNUP,
  ROUTES.FORGOT_PASSWORD,
  ROUTES.VERIFY_EMAIL,
  '/workspace/new',
  '/workspace/select',
  ROUTES.AUTH_CALLBACK,
];

const ROLE_PROTECTED: Array<{ path: string; roles: string[] }> = [
  { path: '/settings/billing', roles: ['super_admin', 'admin'] },
  { path: '/analytics',        roles: ['super_admin', 'admin', 'manager'] },
  { path: '/campaigns',        roles: ['super_admin', 'admin', 'manager'] },
  { path: '/team',             roles: ['super_admin', 'admin', 'manager'] },
];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Pass through static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Pass through public auth routes
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // Build Supabase client with cookie passthrough
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh + check session
  const { data: { user } } = await supabase.auth.getUser();

  // Not authenticated → redirect to login, preserving intended destination
  if (!user) {
    const loginUrl = new URL(ROUTES.LOGIN, request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based route protection
  const agentixRole = request.cookies.get('agentix-role')?.value;
  if (agentixRole) {
    const restricted = ROLE_PROTECTED.find((r) => pathname.startsWith(r.path));
    if (restricted && !restricted.roles.includes(agentixRole)) {
      return NextResponse.redirect(new URL(ROUTES.DASHBOARD, request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
