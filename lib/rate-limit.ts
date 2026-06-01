import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

// Auto-reply rate limiter: max 1 reply per 30 seconds per contact
let autoReplyLimiter: Ratelimit | null = null;
function getAutoReplyLimiter(): Ratelimit | null {
  if (autoReplyLimiter) return autoReplyLimiter;
  const r = getRedis();
  if (!r) return null;
  autoReplyLimiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(1, '30 s'),
    prefix: 'agentix:autoreply',
    analytics: false,
  });
  return autoReplyLimiter;
}

// API rate limiter: max 60 requests per minute per user
let apiLimiter: Ratelimit | null = null;
function getApiLimiter(): Ratelimit | null {
  if (apiLimiter) return apiLimiter;
  const r = getRedis();
  if (!r) return null;
  apiLimiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(60, '60 s'),
    prefix: 'agentix:api',
    analytics: false,
  });
  return apiLimiter;
}

// Webhook outbound rate limiter: max 100 dispatches per minute per workspace
let webhookLimiter: Ratelimit | null = null;
function getWebhookLimiter(): Ratelimit | null {
  if (webhookLimiter) return webhookLimiter;
  const r = getRedis();
  if (!r) return null;
  webhookLimiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(100, '60 s'),
    prefix: 'agentix:webhook',
    analytics: false,
  });
  return webhookLimiter;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

/**
 * Check auto-reply rate limit for a contact.
 * Returns true if reply is allowed, false if throttled.
 */
export async function checkAutoReplyLimit(contactId: string): Promise<boolean> {
  const limiter = getAutoReplyLimiter();
  if (!limiter) return true; // Redis not configured — allow all

  try {
    const { success } = await limiter.limit(contactId);
    return success;
  } catch {
    return true; // Fail open — never block on Redis errors
  }
}

/**
 * Check API rate limit for a user/IP.
 * Returns { success, remaining, reset }
 */
export async function checkApiLimit(identifier: string): Promise<RateLimitResult> {
  const limiter = getApiLimiter();
  if (!limiter) return { success: true, remaining: 60, reset: 0 };

  try {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch {
    return { success: true, remaining: 60, reset: 0 };
  }
}

/**
 * Check webhook dispatch rate limit per workspace.
 */
export async function checkWebhookLimit(workspaceId: string): Promise<boolean> {
  const limiter = getWebhookLimiter();
  if (!limiter) return true;

  try {
    const { success } = await limiter.limit(workspaceId);
    return success;
  } catch {
    return true;
  }
}
