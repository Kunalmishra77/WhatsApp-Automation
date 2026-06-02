import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { ROUTES } from '@/lib/constants';
import { getSupabaseEnv } from '@/lib/supabase-env';

const PUBLIC_ROUTES = [
  ROUTES.LOGIN,
  ROUTES.SIGNUP,
  ROUTES.FORGOT_PASSWORD,
  ROUTES.VERIFY_EMAIL,
  '/workspace/new',
  '/workspace/select',
  ROUTES.AUTH_CALLBACK,
  '/api/data-deletion',
];

const ROLE_PROTECTED: Array<{ path: string; roles: string[] }> = [
  { path: '/settings/billing', roles: ['super_admin', 'admin'] },
  { path: '/analytics', roles: ['super_admin', 'admin', 'manager'] },
  { path: '/campaigns', roles: ['super_admin', 'admin', 'manager'] },
  { path: '/team', roles: ['super_admin', 'admin', 'manager'] },
];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/cron') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(
    url,
    anonKey,
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

  // ── Custom domain lookup (Enterprise plan) ──────────────────────────────
  const hostname = request.headers.get('host') ?? '';
  const domain = hostname.split(':')[0] ?? '';
  const appDomains = ['localhost', 'app.agentix.in', 'whatsapp-automation-kohl-six.vercel.app'];
  const isAppDomain = appDomains.some((d) => domain === d || domain.endsWith(`.${d}`) || domain.endsWith('.vercel.app'));
  if (!isAppDomain && domain.includes('.')) {
    const { createClient: createSvcClient } = await import('@supabase/supabase-js');
    const svcClient = createSvcClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: ws } = await (svcClient as any)
      .from('workspaces').select('id').eq('custom_domain', domain).single();
    if (ws?.id) {
      const headers = new Headers(request.headers);
      headers.set('x-workspace-domain', ws.id as string);
      return NextResponse.next({ request: { headers } });
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const loginUrl = new URL(ROUTES.LOGIN, request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const restricted = ROLE_PROTECTED.find((route) => pathname.startsWith(route.path));
  if (restricted) {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('user_id', user.id)
      .in('role', restricted.roles)
      .limit(1)
      .maybeSingle();

    if (!member) {
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
