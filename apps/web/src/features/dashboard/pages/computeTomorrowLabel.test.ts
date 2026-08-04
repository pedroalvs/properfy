import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { computeTomorrowLabel } from './DashboardPage';

/**
 * The "Tomorrow" card's data window is a **Sydney** civil day, decided
 * server-side. Its heading must name that same day.
 *
 * It previously used the browser's clock (`new Date()` + 1), so any viewer
 * outside Sydney saw a heading naming a different day than the numbers under
 * it. The instant below is chosen so the two disagree: 2026-07-29 20:00 UTC is
 * still Wednesday 29 July in New York but already Thursday 30 July in Sydney.
 *
 * - Sydney-correct answer: tomorrow is **Fri, 31 July**
 * - Browser-local (New York) answer: tomorrow is **Thu, 30 July**
 *
 * A test that does not pin the clock passes on both implementations, which is
 * why this file exists separately from the page's render tests.
 */
const SPLIT_INSTANT = new Date('2026-07-29T20:00:00.000Z');

/**
 * Pinning the process timezone is what gives this file its teeth, and it must
 * be a **non**-Sydney zone — the opposite of `useAnalyticsPeriod.test.ts`.
 *
 * `vi.setSystemTime` fixes the instant, not the zone. A browser-local
 * implementation reads the runner's local clock, so on a machine already in
 * Sydney (or Auckland) it would produce the correct answer by accident and the
 * test would pass on broken code. Nothing in the workspace config sets `TZ`, so
 * without this the check would depend on where CI happens to run.
 */
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('computeTomorrowLabel', () => {
  it('names the Sydney tomorrow, not the viewer local one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SPLIT_INSTANT);

    const label = computeTomorrowLabel();

    expect(label).toContain('31 July');
    // The browser-local answer for a New York viewer — must not appear.
    expect(label).not.toContain('30 July');
  });

  it('keeps the "Tomorrow — " prefix and the day-then-month order', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SPLIT_INSTANT);

    // en-AU orders day before month; en-US would render 'Jul 31'.
    expect(computeTomorrowLabel()).toBe('Tomorrow — Fri, 31 July');
  });

  it('rolls across a month boundary', () => {
    vi.useFakeTimers();
    // 2026-07-31 04:00 UTC is Friday 31 July in Sydney, so tomorrow is 1 August.
    vi.setSystemTime(new Date('2026-07-31T04:00:00.000Z'));

    expect(computeTomorrowLabel()).toContain('1 Aug');
  });
});
