import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/services/supabase/server';
import { ROUTES } from '@/lib/constants';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code      = searchParams.get('code');
  const next      = searchParams.get('next') ?? ROUTES.DASHBOARD;
  const tokenHash = searchParams.get('token_hash');
  const type      = searchParams.get('type') as 'signup' | 'recovery' | null;

  const supabase = await createClient();

  // Email OTP flow (signup confirmation, password reset)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(`${origin}${ROUTES.LOGIN}?error=verification_failed`);
  }

  // PKCE code exchange (OAuth)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}${ROUTES.LOGIN}?error=auth_failed`);
}
