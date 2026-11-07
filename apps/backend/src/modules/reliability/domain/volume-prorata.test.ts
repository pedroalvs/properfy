import { describe, it, expect } from 'vitest';
import { activeDaysInPeriod, proratedVolumeRate } from './volume-prorata';

const FROM = '2026-11-01';
const TO = '2026-11-30';

describe('activeDaysInPeriod', () => {
  it('is the full period when registered before it', () => {
    expect(activeDaysInPeriod('2026-01-01', FROM, TO)).toBe(30);
  });

  it('counts from the registration date inclusively when registered mid-period', () => {
    expect(activeDaysInPeriod('2026-11-19', FROM, TO)).toBe(12);
  });

  it('is 0 when registered after the period end', () => {
    expect(activeDaysInPeriod('2026-12-05', FROM, TO)).toBe(0);
  });

  it('is 1 when registered on the last day', () => {
    expect(activeDaysInPeriod('2026-11-30', FROM, TO)).toBe(1);
  });
});

describe('proratedVolumeRate', () => {
  it('is 1 for a long-registered inspector hitting the reference (12/9.5)', () => {
    expect(proratedVolumeRate(12, 9.5, 30, 30)).toBe(1);
  });

  it('is 1 for a new inspector whose pro-rated reference it meets (10 DONE, ref 9.5, 12 days)', () => {
    // effective reference 9.5 × 12/30 = 3.8 → 10/3.8 capped to 1
    expect(proratedVolumeRate(10, 9.5, 12, 30)).toBe(1);
  });

  it('pro-rates a new, slow inspector (2 DONE, ref 20, 12 days → 0.25)', () => {
    // effective reference 20 × 12/30 = 8 → 2/8 = 0.25 (0.1 without pro-rata)
    expect(proratedVolumeRate(2, 20, 12, 30)).toBe(0.25);
  });

  it('is null when there are no active days', () => {
    expect(proratedVolumeRate(0, 9.5, 0, 30)).toBeNull();
  });
});
