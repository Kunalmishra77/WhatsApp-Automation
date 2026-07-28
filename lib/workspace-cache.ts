// lib/workspace-cache.ts
import { getRedis, type RedisLike } from '@/lib/redis';

const TTL_SECONDS = 60;
const SELECT = 'id, phone_number_id, access_token, name, settings';

export interface WorkspaceCacheRow {
  id: string;
  phone_number_id: string | null;
  access_token: string | null;
  name: string | null;
  settings: Record<string, unknown> | null;
}

function parse(value: unknown): WorkspaceCacheRow | null {
  if (!value) return null;
  try {
    return typeof value === 'string' ? (JSON.parse(value) as WorkspaceCacheRow) : (value as WorkspaceCacheRow);
  } catch {
    return null;
  }
}

async function readCache(redis: RedisLike | null, key: string): Promise<WorkspaceCacheRow | null> {
  if (!redis) return null;
  try {
    return parse(await redis.get(key));
  } catch {
    return null;
  }
}

async function writeCache(redis: RedisLike | null, row: WorkspaceCacheRow, includePnid = true): Promise<void> {
  if (!redis) return;
  const payload = JSON.stringify(row);
  try {
    await redis.set(`agentix:ws:id:${row.id}`, payload, { ex: TTL_SECONDS });
    if (includePnid && row.phone_number_id) await redis.set(`agentix:ws:pnid:${row.phone_number_id}`, payload, { ex: TTL_SECONDS });
  } catch {
    /* fail-open */
  }
}

// Exactly-one-row semantics mirror the app's `.single()` expectation: 0 or >1 rows -> null (and not cached).
function pickSingle(data: unknown): WorkspaceCacheRow | null {
  return Array.isArray(data) && data.length === 1 ? (data[0] as WorkspaceCacheRow) : null;
}

export async function getWorkspaceByPhoneNumberId(
  supabase: any, phoneNumberId: string | null, redis: RedisLike | null = getRedis(),
): Promise<WorkspaceCacheRow | null> {
  if (!phoneNumberId) return null;
  const cached = await readCache(redis, `agentix:ws:pnid:${phoneNumberId}`);
  if (cached) return cached;
  const { data } = await supabase.from('workspaces').select(SELECT).eq('phone_number_id', phoneNumberId);
  const row = pickSingle(data);
  if (row) await writeCache(redis, row);
  return row;
}

export async function getWorkspaceById(
  supabase: any, id: string, redis: RedisLike | null = getRedis(),
): Promise<WorkspaceCacheRow | null> {
  if (!id) return null;
  const cached = await readCache(redis, `agentix:ws:id:${id}`);
  if (cached) return cached;
  const { data } = await supabase.from('workspaces').select(SELECT).eq('id', id);
  const row = pickSingle(data);
  // Only warm the id key: a by-id lookup can't guarantee phone_number_id maps to
  // exactly one workspace, so writing the pnid key here could poison it. That
  // invariant is only established by getWorkspaceByPhoneNumberId's pnid-scoped query.
  if (row) await writeCache(redis, row, false);
  return row;
}

export async function invalidateWorkspace(
  keys: { id?: string; phoneNumberId?: string | null }, redis: RedisLike | null = getRedis(),
): Promise<void> {
  if (!redis) return;
  try {
    if (keys.id) await redis.del(`agentix:ws:id:${keys.id}`);
    if (keys.phoneNumberId) await redis.del(`agentix:ws:pnid:${keys.phoneNumberId}`);
  } catch {
    /* ignore */
  }
}
