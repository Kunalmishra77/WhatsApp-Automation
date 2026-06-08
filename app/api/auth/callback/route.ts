import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { APP_URL, ROUTES } from '@/lib/constants';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code      = searchParams.get('code');
  const next      = searchParams.get('next') ?? ROUTES.DASHBOARD;
  const tokenHash = searchParams.get('token_hash');
  const type      = searchParams.get('type') as 'signup' | 'recovery' | null;

  // Use APP_URL (reads SITE_URL env var) instead of request.url origin.
  // Behind a reverse proxy (Coolify/Traefik), request.url contains the internal
  // Docker address (0.0.0.0:3001) instead of the public domain.
  const base = APP_URL;

  const supabase = await createClient();

  // Email OTP flow (signup confirmation, password reset)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${base}${next}`);
    return NextResponse.redirect(`${base}${ROUTES.LOGIN}?error=verification_failed`);
  }

  // PKCE code exchange (OAuth)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${next}`);
  }

  return NextResponse.redirect(`${base}${ROUTES.LOGIN}?error=auth_failed`);
}
