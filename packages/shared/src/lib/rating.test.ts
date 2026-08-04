import { describe, it, expect } from 'vitest';
import {
  RATING_MIN,
  RATING_MAX,
  RATING_COMMENT_MAX_LENGTH,
  RATING_LABELS,
  formatRatingAverage,
} from './rating';

describe('rating constants', () => {
  it('bounds the scale at 1..5', () => {
    expect(RATING_MIN).toBe(1);
    expect(RATING_MAX).toBe(5);
  });

  it('caps comments at 500 characters', () => {
    expect(RATING_COMMENT_MAX_LENGTH).toBe(500);
  });

  it('labels every value on the scale', () => {
    expect(Object.keys(RATING_LABELS).map(Number).sort()).toEqual([1, 2, 3, 4, 5]);
    for (const label of Object.values(RATING_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('formatRatingAverage', () => {
  it('renders two decimals', () => {
    expect(formatRatingAverage(4.8)).toBe('4.80');
    expect(formatRatingAverage(5)).toBe('5.00');
    expect(formatRatingAverage(3.456)).toBe('3.46');
  });

  it('renders a genuine zero average rather than treating it as absent', () => {
    // 0 is not a reachable average (the scale starts at 1), but the formatter
    // must not silently swallow it — only null/undefined mean "no responses".
    expect(formatRatingAverage(0)).toBe('0.00');
  });

  it('returns null when there is nothing to show', () => {
    expect(formatRatingAverage(null)).toBeNull();
    expect(formatRatingAverage(undefined)).toBeNull();
  });
});
