import { describe, it, expect } from 'vitest';
import { computeVolumeReference } from './volume-reference';

describe('computeVolumeReference — median', () => {
  it('averages the two middle values for an even active population', () => {
    expect(computeVolumeReference([12, 10, 9, 8, 10, 9], null, 30)).toMatchObject({
      value: 9.5,
      source: 'MEDIAN',
      activeInspectors: 6,
    });
  });

  it('takes the middle value for an odd population', () => {
    expect(computeVolumeReference([3, 7, 5], null, 30).value).toBe(5);
  });

  it('ignores inspectors with 0 DONE', () => {
    expect(computeVolumeReference([0, 0, 4, 6], null, 30)).toMatchObject({ value: 5, activeInspectors: 2 });
  });

  it('floors at 1 with nobody active', () => {
    expect(computeVolumeReference([], null, 30)).toMatchObject({ value: 1, source: 'MEDIAN', activeInspectors: 0 });
    expect(computeVolumeReference([0, 0], null, 30)).toMatchObject({ value: 1, activeInspectors: 0 });
  });

  it('is the single value for one active inspector', () => {
    expect(computeVolumeReference([1], null, 30).value).toBe(1);
  });

  it('sorts the input internally', () => {
    expect(computeVolumeReference([9, 12, 8, 10, 9, 10], null, 30).value).toBe(9.5);
  });

  it('does not scale the median by the period (it is already of the period)', () => {
    expect(computeVolumeReference([3, 5], null, 7).value).toBe(4);
  });
});

describe('computeVolumeReference — override', () => {
  it('uses the override as-is on the 30-day window', () => {
    expect(computeVolumeReference([12, 10, 9], 20, 30)).toMatchObject({
      value: 20,
      source: 'OVERRIDE',
      periodDays: 30,
    });
  });

  it.each([
    [7, 4.5], // 20×7/30 = 4.67 → 4.5
    [14, 9.5], // 9.33 → 9.5
    [1, 1], // 0.67 → 0.5 → floor 1
    [92, 61.5], // 61.33 → 61.5
  ])('scales override 20 over %i days to %f', (periodDays, expected) => {
    expect(computeVolumeReference([12, 10, 9], 20, periodDays)).toMatchObject({
      value: expected,
      source: 'OVERRIDE',
    });
  });
});
