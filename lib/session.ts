import { randomBytes } from 'crypto';
import { createAdminClient } from '@/services/supabase/admin';

export const SESSION_COOKIE_NAME = 'ws_session_token';
const EXPIRY_DAYS = 30;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly:  true,
  secure:    process.env.NODE_ENV === 'production',
  sameSite:  'lax'  as const,
  maxAge:    EXPIRY_DAYS * 86400,
  path:      '/',
};

function expiresAt(): string {
  return new Date(Date.now() + EXPIRY_DAYS * 86400 * 1000).toISOString();
}

export async function countActiveSessions(
  workspaceId: string,
  userId:      string,
): Promise<number> {
  const db = createAdminClient() as any;
  const { count } = await db
    .from('workspace_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('user_id',      userId)
    .gt('expires_at',   new Date().toISOString());
  return count ?? 0;
}

/** Returns the new session token, or null if the limit is already reached. */
export async function createSession(
  workspaceId: string,
  userId:      string,
  userAgent:   string,
  maxSessions: number,
): Promise<string | null> {
  const current = await countActiveSessions(workspaceId, userId);
  if (current >= maxSessions) return null;

  const token = randomBytes(32).toString('hex');
  const db    = createAdminClient() as any;
  const { error } = await db.from('workspace_sessions').insert({
    workspace_id:  workspaceId,
    user_id:       userId,
    session_token: token,
    user_agent:    userAgent.slice(0, 512),
    expires_at:    expiresAt(),
  });
  if (error) return null;
  return token;
}

/** Returns true if the token is valid (exists, matches user/workspace, not expired). */
export async function validateSession(
  token:       string,
  workspaceId: string,
  userId:      string,
): Promise<boolean> {
  const db = createAdminClient() as any;
  const { data } = await db
    .from('workspace_sessions')
    .select('id')
    .eq('session_token', token)
    .eq('workspace_id',  workspaceId)
    .eq('user_id',       userId)
    .gt('expires_at',    new Date().toISOString())
    .maybeSingle();
  return !!data;
}

/** Extends the session's expiry by EXPIRY_DAYS from now (sliding window). */
export async function refreshSession(token: string): Promise<void> {
  const db = createAdminClient() as any;
  await db
    .from('workspace_sessions')
    .update({ last_seen_at: new Date().toISOString(), expires_at: expiresAt() })
    .eq('session_token', token);
}

/** Deletes a single session by token. Called on logout. */
export async function deleteSession(token: string): Promise<void> {
  const db = createAdminClient() as any;
  await db.from('workspace_sessions').delete().eq('session_token', token);
}

/** Deletes ALL sessions for this user in this workspace. Used by "revoke all" admin action. */
export async function deleteAllSessions(
  workspaceId: string,
  userId:      string,
): Promise<void> {
  const db = createAdminClient() as any;
  await db
    .from('workspace_sessions')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id',      userId);
}
