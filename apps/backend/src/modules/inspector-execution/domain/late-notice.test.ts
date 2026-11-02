import { describe, it, expect } from 'vitest';
import { computeEstimatedArrivalAt } from './late-notice';

describe('computeEstimatedArrivalAt', () => {
  const iso = (s: string) => new Date(s);

  it('uses the reference when the inspector sends the notice before it', () => {
    // reference 10:15 is later than the 09:30 notice → base is 10:15, +20 = 10:35
    expect(
      computeEstimatedArrivalAt(iso('2026-11-03T10:15:00Z'), iso('2026-11-03T09:30:00Z'), 20),
    ).toEqual(iso('2026-11-03T10:35:00Z'));
  });

  it('uses the notice time when it is already past the reference', () => {
    // reference 09:00 is earlier than the 09:30 notice → base is 09:30, +20 = 09:50
    expect(
      computeEstimatedArrivalAt(iso('2026-11-03T09:00:00Z'), iso('2026-11-03T09:30:00Z'), 20),
    ).toEqual(iso('2026-11-03T09:50:00Z'));
  });

  it('bases the estimate on the later of reference and notice (notice later)', () => {
    // reference 10:15, notice 10:30 → base is 10:30, +20 = 10:50
    expect(
      computeEstimatedArrivalAt(iso('2026-11-03T10:15:00Z'), iso('2026-11-03T10:30:00Z'), 20),
    ).toEqual(iso('2026-11-03T10:50:00Z'));
  });
});
