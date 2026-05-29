export const APP_NAME = 'Agentix';
export const APP_URL  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

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
