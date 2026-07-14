import { describe, expect, it } from 'vitest';
import {
  parseNumberFromReply, compareNumeric, evaluateCondition,
  interpolateTemplate, looksMultiField, isSkippableQuestion, parseExtraction,
} from '../lib/flow-engine';
import type { ConditionNodeData, FlowNode } from '../modules/flows/types';

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

describe('interpolateTemplate', () => {
  const ctx = { patient_name: 0, patient_name_text: 'Rahul Sharma', patient_age: 35, patient_age_text: '35' };

  it('replaces a placeholder with its saved text answer', () => {
    expect(interpolateTemplate('Thank you, {{patient_name}}.', ctx)).toBe('Thank you, Rahul Sharma.');
  });

  it('prefers the _text value over the numeric value', () => {
    expect(interpolateTemplate('Age: {{patient_age}}', ctx)).toBe('Age: 35');
  });

  it('handles surrounding whitespace inside braces', () => {
    expect(interpolateTemplate('Hi {{ patient_name }}', ctx)).toBe('Hi Rahul Sharma');
  });

  it('resolves an unknown placeholder to empty string', () => {
    expect(interpolateTemplate('X={{missing}}', ctx)).toBe('X=');
  });

  it('leaves text without placeholders untouched (existing flows)', () => {
    expect(interpolateTemplate('No placeholders here', ctx)).toBe('No placeholders here');
  });
});

describe('looksMultiField', () => {
  it('is false for short single-value answers', () => {
    expect(looksMultiField('35')).toBe(false);
    expect(looksMultiField('Rahul')).toBe(false);
    expect(looksMultiField('back pain')).toBe(false);
  });

  it('is true for a message that clearly carries several fields', () => {
    expect(looksMultiField('My name is Rahul Sharma, I am 35 with back pain, tomorrow at 5 PM')).toBe(true);
  });

  it('is true for comma-separated multi-part answers', () => {
    expect(looksMultiField('Rahul, 35, back pain, tomorrow, 5 PM')).toBe(true);
  });
});

describe('isSkippableQuestion', () => {
  const q = (id: string, saveAsVariable?: string, forceAsk?: boolean): FlowNode => ({
    id, type: 'question', position: { x: 0, y: 0 },
    data: { label: id, message: id, timeoutHours: 24, saveAsVariable, ...(forceAsk ? { forceAsk } : {}) },
  } as FlowNode);

  it('skips a unique, already-answered question', () => {
    const counts = new Map([['preferred_date', 1]]);
    expect(isSkippableQuestion(q('n', 'preferred_date'), counts, { preferred_date_text: 'tomorrow' })).toBe(true);
  });

  it('does not skip when the answer is not in context', () => {
    const counts = new Map([['preferred_date', 1]]);
    expect(isSkippableQuestion(q('n', 'preferred_date'), counts, {})).toBe(false);
  });

  it('does not skip a variable reused across questions (protects Skinwise-style flows)', () => {
    const counts = new Map([['1', 6]]);
    expect(isSkippableQuestion(q('n', '1'), counts, { '1_text': 'x' })).toBe(false);
  });

  it('never skips a forceAsk question (protects validation re-ask loops)', () => {
    const counts = new Map([['patient_age', 1]]);
    expect(isSkippableQuestion(q('n', 'patient_age', true), counts, { patient_age_text: '200' })).toBe(false);
  });

  it('does not skip a question without a saved variable', () => {
    expect(isSkippableQuestion(q('n'), new Map(), {})).toBe(false);
  });
});

describe('parseExtraction', () => {
  const allowed = ['patient_name', 'patient_age', 'preferred_time'];

  it('keeps only allowed keys that are present', () => {
    const raw = '{"patient_name":"Rahul","patient_age":"35","unrelated":"x"}';
    expect(parseExtraction(raw, allowed)).toEqual({ patient_name: 'Rahul', patient_age: '35' });
  });

  it('extracts a JSON object embedded in surrounding prose', () => {
    const raw = 'Here you go: {"preferred_time":"5 PM"} hope that helps';
    expect(parseExtraction(raw, allowed)).toEqual({ preferred_time: '5 PM' });
  });

  it('coerces numeric values to strings', () => {
    expect(parseExtraction('{"patient_age":35}', allowed)).toEqual({ patient_age: '35' });
  });

  it('returns an empty object on non-JSON input', () => {
    expect(parseExtraction('no json here', allowed)).toEqual({});
  });

  it('omits empty-string values', () => {
    expect(parseExtraction('{"patient_name":"  "}', allowed)).toEqual({});
  });
});
