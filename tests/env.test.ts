import { describe, expect, it } from 'vitest';
import { cleanEnvValue } from '../lib/supabase-env';

describe('cleanEnvValue', () => {
  it('strips BOM, quotes, and surrounding whitespace', () => {
    expect(cleanEnvValue('\uFEFF "secret-value" \n', 'TEST_SECRET')).toBe('secret-value');
  });

  it('throws for missing required values', () => {
    expect(() => cleanEnvValue('   ', 'MISSING_SECRET')).toThrow('MISSING_SECRET');
  });
});
