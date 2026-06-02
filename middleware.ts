import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/services/supabase/middleware';
import { createClient } from '@supabase/supabase-js';

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  const hostname = request.headers.get('host') ?? '';
  // Strip port for local dev
  const domain = hostname.split(':')[0] ?? '';

  // Skip known app domains — only run custom domain lookup for other hostnames
  const appDomains = ['localhost', 'app.agentix.in', 'whatsapp-automation-kohl-six.vercel.app'];
  const isAppDomain = appDomains.some((d) => domain === d || domain.endsWith(`.${d}`));

  if (!isAppDomain && domain.includes('.')) {
    // Look up workspace by custom_domain
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: workspace } = await (supabase as any)
      .from('workspaces')
      .select('id')
      .eq('custom_domain', domain)
      .single();

    if (workspace?.id) {
      // Rewrite: add workspace ID header so server components can use it
      const rewrittenResponse = NextResponse.next({
        request: {
          headers: new Headers({
            ...Object.fromEntries(request.headers.entries()),
            'x-workspace-domain': workspace.id as string,
          }),
        },
      });
      // Copy cookies from updateSession response
      response.cookies.getAll().forEach((cookie) => {
        rewrittenResponse.cookies.set(cookie);
      });
      return rewrittenResponse;
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static files and _next
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
