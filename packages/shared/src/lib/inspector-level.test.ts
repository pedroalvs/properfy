import { describe, expect, it } from 'vitest';
import { isEarlyAccessLevel, minScoreForLevel, resolveInspectorLevel } from './inspector-level';

const DEFAULTS = { silverMinScore: 60, goldMinScore: 85 };

describe('resolveInspectorLevel', () => {
  it.each([
    [null, null],
    [0, 'BRONZE'],
    [59.9, 'BRONZE'],
    [60, 'SILVER'],
    [84.9, 'SILVER'],
    [85, 'GOLD'],
    [88.3, 'GOLD'],
    [100, 'GOLD'],
  ] as const)('score %s with default thresholds -> %s', (score, expected) => {
    expect(resolveInspectorLevel(score, DEFAULTS)).toBe(expected);
  });

  it('respects custom thresholds (72 with {70,90} -> SILVER)', () => {
    expect(resolveInspectorLevel(72, { silverMinScore: 70, goldMinScore: 90 })).toBe('SILVER');
  });
});

describe('isEarlyAccessLevel', () => {
  it('compares level rank against the minimum', () => {
    expect(isEarlyAccessLevel('GOLD', 'SILVER')).toBe(true);
    expect(isEarlyAccessLevel('SILVER', 'SILVER')).toBe(true);
    expect(isEarlyAccessLevel('BRONZE', 'SILVER')).toBe(false);
    expect(isEarlyAccessLevel(null, 'SILVER')).toBe(false);
  });
});

describe('minScoreForLevel', () => {
  it('returns the floor score each level requires', () => {
    expect(minScoreForLevel('BRONZE', DEFAULTS)).toBe(0);
    expect(minScoreForLevel('SILVER', DEFAULTS)).toBe(60);
    expect(minScoreForLevel('GOLD', DEFAULTS)).toBe(85);
  });
});
