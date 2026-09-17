import { describe, it, expect } from 'vitest';
import { extractLeadFields } from '@/lib/google-ads-lead-parse';

describe('extractLeadFields', () => {
  it('maps standard Google Ads lead columns', () => {
    const r = extractLeadFields([
      { column_id: 'FULL_NAME', column_name: 'Full Name', string_value: 'Asha Rao' },
      { column_id: 'EMAIL', column_name: 'Email', string_value: 'asha@example.com' },
      { column_id: 'PHONE_NUMBER', column_name: 'Phone Number', string_value: '+919812345678' },
    ]);
    expect(r.name).toBe('Asha Rao');
    expect(r.email).toBe('asha@example.com');
    expect(r.phone).toBe('+919812345678');
  });

  it('composes first + last name and collects extras', () => {
    const r = extractLeadFields([
      { column_id: 'FIRST_NAME', string_value: 'Asha' },
      { column_id: 'LAST_NAME', string_value: 'Rao' },
      { column_name: 'City', string_value: 'Delhi' },
    ]);
    expect(r.name).toBe('Asha Rao');
    expect(r.extra['City']).toBe('Delhi');
  });

  it('falls back to column_name when column_id is missing', () => {
    const r = extractLeadFields([
      { column_name: 'Email Address', string_value: 'x@y.com' },
      { column_name: 'Phone', string_value: '999' },
    ]);
    expect(r.email).toBe('x@y.com');
    expect(r.phone).toBe('999');
  });

  it('handles empty / non-array input safely', () => {
    expect(extractLeadFields(null)).toEqual({ name: null, email: null, phone: null, extra: {} });
    expect(extractLeadFields([])).toEqual({ name: null, email: null, phone: null, extra: {} });
    expect(extractLeadFields([{ column_id: 'EMAIL', string_value: '' }]).email).toBeNull();
  });
});
