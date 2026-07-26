import { isPastScheduledEnd } from '../isPastScheduledEnd';

// Sydney 2026-07-21 14:00 is AEST (UTC+10) → 2026-07-21T04:00:00Z.
const SYDNEY_2026_07_21_14_00 = new Date('2026-07-21T04:00:00Z');
// Sydney 2026-03-25 10:00 is AEDT (UTC+11) → 2026-03-24T23:00:00Z.
const SYDNEY_2026_03_25_10_00 = new Date('2026-03-24T23:00:00Z');

describe('isPastScheduledEnd', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SYDNEY_2026_07_21_14_00);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when the slot end is later today', () => {
    expect(isPastScheduledEnd('2026-07-21', '15:00')).toBe(false);
  });

  it('returns true when the slot end has passed today', () => {
    expect(isPastScheduledEnd('2026-07-21', '13:00')).toBe(true);
  });

  it('returns false exactly at the slot end', () => {
    expect(isPastScheduledEnd('2026-07-21', '14:00')).toBe(false);
  });

  it('returns true for a previous Sydney date regardless of time', () => {
    expect(isPastScheduledEnd('2026-07-20', '23:00')).toBe(true);
  });

  it('returns false for a future Sydney date', () => {
    expect(isPastScheduledEnd('2026-07-22', '09:00')).toBe(false);
  });

  it('evaluates in Sydney time during AEDT (daylight saving)', () => {
    vi.setSystemTime(SYDNEY_2026_03_25_10_00);
    expect(isPastScheduledEnd('2026-03-25', '09:30')).toBe(true);
    expect(isPastScheduledEnd('2026-03-25', '10:30')).toBe(false);
  });
});
