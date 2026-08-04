import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useWorkloadWeek } from './useWorkloadWeek';

/**
 * Pinning the process timezone to Sydney is the point of this file, not a
 * detail — the same reasoning as `useAnalyticsPeriod.test.ts`. A week derived
 * from local calendar components lands a day early east of UTC, and neither CI
 * nor a dev machine sits in Sydney, so an unpinned suite would pass anyway.
 */
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Australia/Sydney';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function wrapperFor(initialUrl: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>;
  };
}

function renderWeek(initialUrl = '/inspector-workload') {
  return renderHook(
    () => ({ week: useWorkloadWeek(), location: useLocation() }),
    { wrapper: wrapperFor(initialUrl) },
  );
}

/**
 * `useUrlFilters` debounces its URL writes by 300 ms, so a navigation action is
 * not observable until the timer fires.
 */
function flushUrlWrite() {
  act(() => {
    vi.advanceTimersByTime(400);
  });
}

describe('useWorkloadWeek', () => {
  it('anchors the week to a Monday from an arbitrary date in the URL', () => {
    // 2026-07-30 is a Thursday.
    const { result } = renderWeek('/inspector-workload?week=2026-07-30');

    expect(result.current.week.weekStart).toBe('2026-07-27');
    expect(result.current.week.weekEnd).toBe('2026-08-02');
  });

  it('lists the seven civil days of the week', () => {
    const { result } = renderWeek('/inspector-workload?week=2026-07-27');

    expect(result.current.week.days).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('steps back a whole week and writes a Monday to the URL', () => {
    const { result } = renderWeek('/inspector-workload?week=2026-07-27');

    act(() => result.current.week.goPrev());
    flushUrlWrite();

    expect(result.current.week.weekStart).toBe('2026-07-20');
    expect(result.current.location.search).toContain('week=2026-07-20');
  });

  it('steps forward across a month boundary', () => {
    const { result } = renderWeek('/inspector-workload?week=2026-07-27');

    act(() => result.current.week.goNext());
    flushUrlWrite();

    expect(result.current.week.weekStart).toBe('2026-08-03');
  });

  it('snaps an arbitrary date passed to setWeek onto its Monday', () => {
    const { result } = renderWeek('/inspector-workload?week=2026-07-27');

    // A Saturday — the API rejects a non-Monday, so the URL must never hold one.
    act(() => result.current.week.setWeek('2026-08-08'));
    flushUrlWrite();

    expect(result.current.week.weekStart).toBe('2026-08-03');
    expect(result.current.location.search).toContain('week=2026-08-03');
  });

  /**
   * Sydney observes DST (first Sunday in April, first Sunday in October). Civil
   * string math is unaffected by the offset change; `Date`-based math is not.
   */
  it.each([
    ['April DST end', '2026-03-30', '2026-04-06'],
    ['October DST start', '2026-09-28', '2026-10-05'],
  ])('steps cleanly across %s', (_label, from, expected) => {
    const { result } = renderWeek(`/inspector-workload?week=${from}`);

    act(() => result.current.week.goNext());
    flushUrlWrite();

    expect(result.current.week.weekStart).toBe(expected);
    expect(result.current.week.days).toHaveLength(7);
  });

  it.each([
    ['garbage', 'not-a-date'],
    ['an impossible calendar date', '2026-02-31'],
    ['an empty value', ''],
  ])('falls back to the current week for %s', (_label, week) => {
    const { result } = renderWeek(`/inspector-workload?week=${week}`);

    expect(result.current.week.isCurrentWeek).toBe(true);
    expect(new Date(`${result.current.week.weekStart}T00:00:00.000Z`).getUTCDay()).toBe(1);
  });

  it('flags a non-current week and returns to today', () => {
    const { result } = renderWeek('/inspector-workload?week=2020-01-06');
    expect(result.current.week.isCurrentWeek).toBe(false);

    act(() => result.current.week.goThisWeek());
    flushUrlWrite();

    expect(result.current.week.isCurrentWeek).toBe(true);
  });

  it('returns a referentially stable object across re-renders', () => {
    const { result, rerender } = renderWeek('/inspector-workload?week=2026-07-27');
    const first = result.current.week;

    rerender();

    // An unmemoized derived return caused a production render loop (PR #961).
    expect(result.current.week).toBe(first);
  });
});
