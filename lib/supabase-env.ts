export function cleanEnvValue(value: string | undefined, name: string): string {
  const cleaned = value
    ?.replace(/\uFEFF/g, '')
    .trim()
    .replace(/^['"]|['"]$/g, '');

  if (!cleaned) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return cleaned;
}

export function getSupabaseEnv() {
  return {
    url: cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: cleanEnvValue(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ),
  };
}

export function getSupabaseServiceEnv() {
  return {
    ...getSupabaseEnv(),
    serviceRoleKey: cleanEnvValue(
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      'SUPABASE_SERVICE_ROLE_KEY',
    ),
  };
}

export function getRequiredSecret(name: string): string {
  return cleanEnvValue(process.env[name], name);
}
