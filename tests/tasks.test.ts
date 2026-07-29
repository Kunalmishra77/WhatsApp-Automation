import { describe, expect, it } from 'vitest';
import { completedAtForStatus, isOverdue, validateTaskInput, TASK_STATUSES, TASK_PRIORITIES } from '../lib/tasks';

describe('completedAtForStatus', () => {
  const now = '2026-07-29T10:00:00.000Z';
  it('stamps completed_at when done', () => {
    expect(completedAtForStatus('done', now)).toBe(now);
  });
  it('clears completed_at for non-done statuses', () => {
    expect(completedAtForStatus('todo', now)).toBeNull();
    expect(completedAtForStatus('in_progress', now)).toBeNull();
  });
});

describe('isOverdue', () => {
  const now = Date.parse('2026-07-29T10:00:00Z');
  it('is true when due in the past and not done', () => {
    expect(isOverdue('2026-07-28T10:00:00Z', 'todo', now)).toBe(true);
  });
  it('is false when done, or no due date, or due in the future', () => {
    expect(isOverdue('2026-07-28T10:00:00Z', 'done', now)).toBe(false);
    expect(isOverdue(null, 'todo', now)).toBe(false);
    expect(isOverdue('2026-07-30T10:00:00Z', 'todo', now)).toBe(false);
  });
});

describe('validateTaskInput', () => {
  it('accepts a valid task', () => {
    expect(validateTaskInput({ title: 'Call lead', priority: 'high', status: 'todo' })).toBeNull();
  });
  it('requires a non-empty title', () => {
    expect(validateTaskInput({ title: '   ' })).toMatch(/title/i);
  });
  it('rejects invalid priority/status', () => {
    expect(validateTaskInput({ title: 'x', priority: 'urgent' })).toMatch(/priority/i);
    expect(validateTaskInput({ title: 'x', status: 'blocked' })).toMatch(/status/i);
  });
  it('exposes the allowed enums', () => {
    expect(TASK_STATUSES).toEqual(['todo', 'in_progress', 'done']);
    expect(TASK_PRIORITIES).toEqual(['low', 'medium', 'high']);
  });
});
