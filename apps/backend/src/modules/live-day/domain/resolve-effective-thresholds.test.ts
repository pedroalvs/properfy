import { describe, it, expect } from 'vitest';
import {
  parseAlertOverride,
  resolveEffectiveThresholds,
} from './resolve-effective-thresholds';

const PLATFORM = { delayMinutes: 20, notStartedMinutes: 30 };

describe('resolveEffectiveThresholds (field-by-field)', () => {
  it('uses platform defaults when no override', () => {
    expect(resolveEffectiveThresholds({ delayMinutes: null, notStartedMinutes: null }, PLATFORM)).toEqual({
      delayMinutes: 20,
      delaySource: 'PLATFORM',
      notStartedMinutes: 30,
      notStartedSource: 'PLATFORM',
    });
  });

  it('applies a per-field override and reports its source', () => {
    expect(resolveEffectiveThresholds({ delayMinutes: 45, notStartedMinutes: null }, PLATFORM)).toEqual({
      delayMinutes: 45,
      delaySource: 'INSPECTOR',
      notStartedMinutes: 30,
      notStartedSource: 'PLATFORM',
    });
  });
});

describe('parseAlertOverride (defensive)', () => {
  it('keeps valid in-range integers', () => {
    expect(parseAlertOverride({ delayMinutes: 15, notStartedMinutes: 240 })).toEqual({
      delayMinutes: 15,
      notStartedMinutes: 240,
    });
  });

  it('drops out-of-range / non-integer / wrong-type values to null', () => {
    expect(parseAlertOverride({ delayMinutes: 4, notStartedMinutes: 241 })).toEqual({
      delayMinutes: null,
      notStartedMinutes: null,
    });
    expect(parseAlertOverride({ delayMinutes: 10.5, notStartedMinutes: '30' })).toEqual({
      delayMinutes: null,
      notStartedMinutes: null,
    });
  });

  it('returns an empty override for null / non-object', () => {
    expect(parseAlertOverride(null)).toEqual({ delayMinutes: null, notStartedMinutes: null });
    expect(parseAlertOverride('nope')).toEqual({ delayMinutes: null, notStartedMinutes: null });
  });
});
