import { createAdminClient } from '@/services/supabase/admin';

export interface ApiAuthContext {
  workspaceId: string;
  keyId: string;
}

/**
 * Validate API key from Authorization header.
 * Supports: "Bearer agx_live_xxxx" or "X-API-Key: agx_live_xxxx"
 */
export async function validateApiKey(request: Request): Promise<ApiAuthContext | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const xApiKey    = request.headers.get('x-api-key') ?? '';

  const raw = xApiKey.trim() || authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!raw || !raw.startsWith('agx_')) return null;

  // Hash the key
  const hash = await sha256(raw);

  const db = createAdminClient() as any;
  const { data: apiKey } = await db
    .from('workspace_api_keys')
    .select('id, workspace_id, expires_at, is_active')
    .eq('key_hash', hash)
    .maybeSingle();

  if (!apiKey || !apiKey.is_active) return null;
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) return null;

  // Update last_used_at (fire-and-forget)
  void db
    .from('workspace_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id);

  return { workspaceId: apiKey.workspace_id as string, keyId: apiKey.id as string };
}

export function apiUnauthorized(msg = 'Invalid or missing API key') {
  return Response.json({ error: msg, docs: 'https://agentix.in/docs/api' }, { status: 401 });
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Generate a new API key — returns { key, hash, prefix } */
export async function generateApiKey(): Promise<{ key: string; hash: string; prefix: string }> {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  const key    = `agx_live_${random}`;
  const hash   = await sha256(key);
  const prefix = key.slice(0, 16); // "agx_live_xxxxxxx" first 16 chars
  return { key, hash, prefix };
}
