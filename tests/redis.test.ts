// tests/redis.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { getRedis, resetRedisClientForTests } from '../lib/redis';

describe('getRedis', () => {
  beforeEach(() => resetRedisClientForTests());

  it('returns null when Upstash env vars are absent', () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(getRedis()).toBeNull();
  });

  it('memoizes: repeated calls return the same value', () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    expect(getRedis()).toBe(getRedis());
  });
});
