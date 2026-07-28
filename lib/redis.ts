import { Redis } from '@upstash/redis';

let client: Redis | null | undefined;

/** Shared Upstash Redis client. Returns null when env is unconfigured (fail-open). */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

/** Test-only: clears the memoized client so env changes take effect. */
export function resetRedisClientForTests(): void {
  client = undefined;
}

/** Minimal shape the cache/idempotency helpers rely on (also satisfied by the real client). */
export interface RedisLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, opts?: { ex: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}
