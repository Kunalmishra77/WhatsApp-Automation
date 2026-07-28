import crypto from 'crypto';
import { getRedis, type RedisLike } from '@/lib/redis';

const TTL_SECONDS = 60 * 60 * 24; // 24h — covers Meta's retry window

/**
 * Stable key for one webhook delivery. Prefers the x-hub-signature-256 (Meta's
 * HMAC of the exact body — a retry carries the identical signature). Falls back
 * to a hash of the sorted message ids so batched deliveries key as a unit.
 */
export function webhookIdemKey(signature: string | null | undefined, metaMessageIds: string[]): string {
  const sig = signature?.trim();
  if (sig) return sig;
  const basis = [...metaMessageIds].sort().join(',');
  return 'h:' + crypto.createHash('sha256').update(basis).digest('hex');
}

export async function isWebhookProcessed(key: string, redis: RedisLike | null = getRedis()): Promise<boolean> {
  if (!redis || !key) return false;
  try {
    return (await redis.get(`agentix:wh:${key}`)) !== null;
  } catch {
    return false; // fail-open: process normally
  }
}

export async function markWebhookProcessed(key: string, redis: RedisLike | null = getRedis()): Promise<void> {
  if (!redis || !key) return;
  try {
    await redis.set(`agentix:wh:${key}`, 1, { ex: TTL_SECONDS });
  } catch {
    /* fail-open: leave unmarked so a retry reprocesses */
  }
}
