import { describe, expect, it } from 'vitest';
import { parseNumberFromReply, compareNumeric, evaluateCondition } from '../lib/flow-engine';
import type { ConditionNodeData } from '../modules/flows/types';

describe('parseNumberFromReply', () => {
  it('parses a clean integer', () => {
    expect(parseNumberFromReply('12')).toBe(12);
  });

  it('extracts the first number from text', () => {
    expect(parseNumberFromReply('around 15 log hain')).toBe(15);
    expect(parseNumberFromReply('8-10 employees')).toBe(8);
  });

  it('returns 0 when no digits are present', () => {
    expect(parseNumberFromReply('bahut log hain')).toBe(0);
  });
});

describe('compareNumeric', () => {
  it('evaluates >= correctly', () => {
    expect(compareNumeric(10, '>=', 10)).toBe(true);
    expect(compareNumeric(9, '>=', 10)).toBe(false);
  });

  it('evaluates > correctly', () => {
    expect(compareNumeric(11, '>', 10)).toBe(true);
    expect(compareNumeric(10, '>', 10)).toBe(false);
  });

  it('evaluates < correctly', () => {
    expect(compareNumeric(5, '<', 10)).toBe(true);
    expect(compareNumeric(10, '<', 10)).toBe(false);
  });

  it('evaluates <= correctly', () => {
    expect(compareNumeric(10, '<=', 10)).toBe(true);
    expect(compareNumeric(11, '<=', 10)).toBe(false);
  });

  it('evaluates == correctly', () => {
    expect(compareNumeric(10, '==', 10)).toBe(true);
    expect(compareNumeric(9, '==', 10)).toBe(false);
  });

  it('evaluates != correctly', () => {
    expect(compareNumeric(9, '!=', 10)).toBe(true);
    expect(compareNumeric(10, '!=', 10)).toBe(false);
  });
});

describe('evaluateCondition', () => {
  const baseData: ConditionNodeData = { label: 'x', keyword: 'yes', matchType: 'contains' };

  it('falls back to keyword matching when conditionType is not set', () => {
    expect(evaluateCondition(baseData, 'Yes please', {})).toBe(true);
    expect(evaluateCondition(baseData, 'no thanks', {})).toBe(false);
  });

  it('compares a saved variable when conditionType is variable_compare', () => {
    const data: ConditionNodeData = {
      ...baseData,
      conditionType: 'variable_compare',
      variable: 'employee_count',
      operator: '>=',
      value: 10,
    };
    expect(evaluateCondition(data, 'irrelevant reply', { employee_count: 12 })).toBe(true);
    expect(evaluateCondition(data, 'irrelevant reply', { employee_count: 5 })).toBe(false);
  });

  it('treats a missing variable as 0', () => {
    const data: ConditionNodeData = {
      ...baseData,
      conditionType: 'variable_compare',
      variable: 'employee_count',
      operator: '>=',
      value: 10,
    };
    expect(evaluateCondition(data, 'irrelevant reply', {})).toBe(false);
  });
});
