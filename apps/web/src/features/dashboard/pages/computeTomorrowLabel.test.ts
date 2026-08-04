import { describe, it, expect, afterEach, vi } from 'vitest';
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
