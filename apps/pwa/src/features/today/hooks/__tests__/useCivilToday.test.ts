import { renderHook, act } from '@testing-library/react';
import { useCivilToday } from '../useCivilToday';

vi.mock('@/hooks/useEffectiveTimezone', () => ({
  useEffectiveTimezone: () => 'Australia/Sydney',
}));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useCivilToday', () => {
  it('returns today in the effective timezone, not the device', () => {
    // 2026-11-04T22:00Z is 2026-11-05 09:00 in Sydney.
    vi.setSystemTime(new Date('2026-11-04T22:00:00.000Z'));
    const { result } = renderHook(() => useCivilToday());
    expect(result.current).toBe('2026-11-05');
  });

  it('recomputes the civil date on visibilitychange at the day boundary', () => {
    vi.setSystemTime(new Date('2026-11-04T22:00:00.000Z')); // 2026-11-05 Sydney
    const { result } = renderHook(() => useCivilToday());
    expect(result.current).toBe('2026-11-05');

    // Advance into the next Sydney civil day (00:01 on 2026-11-06 = 13:01Z on the 5th).
    vi.setSystemTime(new Date('2026-11-05T13:01:00.000Z'));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('2026-11-06');
  });

  it('recomputes via the midnight timer without any event', () => {
    vi.setSystemTime(new Date('2026-11-05T12:59:00.000Z')); // 23:59 Sydney on the 5th
    const { result } = renderHook(() => useCivilToday());
    expect(result.current).toBe('2026-11-05');

    act(() => {
      vi.setSystemTime(new Date('2026-11-05T13:05:00.000Z')); // 00:05 Sydney on the 6th
      vi.advanceTimersByTime(3 * 60 * 1000);
    });
    expect(result.current).toBe('2026-11-06');
  });
});
