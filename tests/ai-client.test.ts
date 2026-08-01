import { describe, expect, it } from 'vitest';
import { isRetriableStatus } from '../lib/ai-client';

describe('isRetriableStatus', () => {
  it('retries on 429 (rate limit) and 5xx (transient server errors)', () => {
    expect(isRetriableStatus(429)).toBe(true);
    expect(isRetriableStatus(500)).toBe(true);
    expect(isRetriableStatus(502)).toBe(true);
    expect(isRetriableStatus(503)).toBe(true);
  });
  it('does not retry on 4xx client errors (bad request / auth)', () => {
    expect(isRetriableStatus(400)).toBe(false);
    expect(isRetriableStatus(401)).toBe(false);
    expect(isRetriableStatus(403)).toBe(false);
    expect(isRetriableStatus(404)).toBe(false);
  });
  it('does not treat 200 as retriable', () => {
    expect(isRetriableStatus(200)).toBe(false);
  });
});
