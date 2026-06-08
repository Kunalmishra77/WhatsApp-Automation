import { cleanEnvValue } from './supabase-env';

export const APP_NAME = 'Agentix';

const RAW_APP_URL = process.env.NEXT_PUBLIC_APP_URL
  ? cleanEnvValue(process.env.NEXT_PUBLIC_APP_URL, 'NEXT_PUBLIC_APP_URL')
  : 'http://localhost:3000';

/** Returns true for internal/Docker addresses that are not reachable from the internet */
function isInternalAddress(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.')
    );
  } catch {
    return true;
  }
}

/**
 * Public-facing app URL safe for use in emails and redirects.
 * Priority: SITE_URL env var → NEXT_PUBLIC_APP_URL (if public) → production fallback
 */
export const APP_URL: string = (() => {
  // SITE_URL is the recommended server-side-only env var for Coolify deployments
  if (process.env.SITE_URL) return process.env.SITE_URL.trim();
  if (!isInternalAddress(RAW_APP_URL)) return RAW_APP_URL;
  return 'https://app.aiagentixdev.com';
})();

export const ROUTES = {
  LOGIN:            '/login',
  SIGNUP:           '/signup',
  FORGOT_PASSWORD:  '/forgot-password',
  VERIFY_EMAIL:     '/verify-email',
  WORKSPACE_NEW:    '/workspace/new',
  WORKSPACE_SELECT: '/workspace/select',
  DASHBOARD:        '/conversations',
  AUTH_CALLBACK:    '/api/auth/callback',
} as const;

export const SUPABASE_ERRORS: Record<string, string> = {
  'Invalid login credentials':                    'Incorrect email or password.',
  'Email not confirmed':                          'Please verify your email before signing in.',
  'User already registered':                      'An account with this email already exists.',
  'Password should be at least 6 characters':    'Password must be at least 8 characters.',
};

export function friendlySupabaseError(message: string): string {
  return SUPABASE_ERRORS[message] ?? message;
}
