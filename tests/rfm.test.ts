import { describe, it, expect } from 'vitest';
import { segmentFromScores, recencyScore, frequencyScore, monetaryScore } from '@/lib/rfm';

describe('segmentFromScores', () => {
  it('classifies champions (recent, frequent, high spend)', () => {
    expect(segmentFromScores(3, 3, 3)).toBe('champions');
    expect(segmentFromScores(3, 2, 2)).toBe('champions');
  });
  it('classifies loyal by high frequency', () => {
    expect(segmentFromScores(2, 3, 1)).toBe('loyal');
  });
  it('classifies big spenders', () => {
    expect(segmentFromScores(2, 1, 3)).toBe('big_spenders');
  });
  it('classifies new (recent, first order)', () => {
    expect(segmentFromScores(3, 1, 1)).toBe('new');
  });
  it('classifies at-risk (used to buy, gone quiet)', () => {
    expect(segmentFromScores(1, 2, 2)).toBe('at_risk');
  });
  it('classifies lost (old, one-time)', () => {
    expect(segmentFromScores(1, 1, 1)).toBe('lost');
  });
  it('classifies promising for mid recency', () => {
    expect(segmentFromScores(2, 1, 1)).toBe('promising');
  });
});

describe('score helpers', () => {
  it('recencyScore buckets by days', () => {
    expect(recencyScore(5)).toBe(3);
    expect(recencyScore(60)).toBe(2);
    expect(recencyScore(200)).toBe(1);
  });
  it('frequencyScore buckets by count', () => {
    expect(frequencyScore(6)).toBe(3);
    expect(frequencyScore(3)).toBe(2);
    expect(frequencyScore(1)).toBe(1);
  });
  it('monetaryScore buckets by tertile thresholds', () => {
    expect(monetaryScore(25000, 5000, 20000)).toBe(3);
    expect(monetaryScore(8000, 5000, 20000)).toBe(2);
    expect(monetaryScore(1000, 5000, 20000)).toBe(1);
  });
});
