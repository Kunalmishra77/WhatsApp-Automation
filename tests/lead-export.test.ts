import { describe, expect, it } from 'vitest';
import { LEAD_EXPORT_HEADERS, leadToRow, parseTemperature, rowsToCsv } from '../lib/lead-export';

describe('parseTemperature', () => {
  it('accepts hot/warm/cold', () => {
    expect(parseTemperature('hot')).toBe('hot');
    expect(parseTemperature('WARM')).toBe('warm');
    expect(parseTemperature('cold')).toBe('cold');
  });
  it('treats all / null / unknown as no filter', () => {
    expect(parseTemperature('all')).toBeNull();
    expect(parseTemperature(null)).toBeNull();
    expect(parseTemperature('spicy')).toBeNull();
  });
});

describe('leadToRow', () => {
  const lead = {
    temperature: 'hot',
    stage: 'qualified', priority: 'high', source: 'whatsapp', value: 1999, currency: 'INR',
    tags: ['vip', 'delhi'], follow_up_at: '2026-08-01T00:00:00Z', created_at: '2026-07-20T00:00:00Z',
    contacts: { name: 'Rahul', phone: '9199' },
    profiles: { full_name: 'Agent A', email: 'a@x.com' },
    conversations: { last_message_at: '2026-07-28T00:00:00Z' },
  };
  it('maps fields in header order', () => {
    const row = leadToRow(lead);
    expect(row.length).toBe(LEAD_EXPORT_HEADERS.length);
    expect(row[LEAD_EXPORT_HEADERS.indexOf('Contact Name')]).toBe('Rahul');
    expect(row[LEAD_EXPORT_HEADERS.indexOf('Phone')]).toBe('9199');
    expect(row[LEAD_EXPORT_HEADERS.indexOf('Temperature')]).toBe('hot');
    expect(row[LEAD_EXPORT_HEADERS.indexOf('Stage')]).toBe('qualified');
    expect(row[LEAD_EXPORT_HEADERS.indexOf('Value')]).toBe('1999');
    expect(row[LEAD_EXPORT_HEADERS.indexOf('Tags')]).toBe('vip, delhi');
    expect(row[LEAD_EXPORT_HEADERS.indexOf('Assigned Agent')]).toBe('Agent A');
  });
  it('falls back gracefully on missing contact / agent / value', () => {
    const row = leadToRow({ stage: 'new', contacts: null, profiles: null });
    expect(row[LEAD_EXPORT_HEADERS.indexOf('Contact Name')]).toBe('');
    expect(row[LEAD_EXPORT_HEADERS.indexOf('Temperature')]).toBe('warm'); // default
    expect(row[LEAD_EXPORT_HEADERS.indexOf('Assigned Agent')]).toBe('Unassigned');
    expect(row[LEAD_EXPORT_HEADERS.indexOf('Value')]).toBe('');
  });
});

describe('rowsToCsv', () => {
  it('escapes quotes and wraps every cell', () => {
    const csv = rowsToCsv(['A', 'B'], [['x', 'he said "hi"']]);
    expect(csv).toBe('"A","B"\n"x","he said ""hi"""');
  });
});
