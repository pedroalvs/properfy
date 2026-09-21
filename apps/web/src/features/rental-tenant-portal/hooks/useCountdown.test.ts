import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdown } from './useCountdown';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCountdown', () => {
  it('returns expired state when no deadline provided', () => {
    const { result } = renderHook(() => useCountdown(undefined));

    expect(result.current.isExpired).toBe(true);
    expect(result.current.hours).toBe(0);
    expect(result.current.minutes).toBe(0);
    expect(result.current.isCritical).toBe(true);
    expect(result.current.label).toBe('');
  });

  it('returns expired state when deadline is in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const { result } = renderHook(() => useCountdown(past));

    expect(result.current.isExpired).toBe(true);
    expect(result.current.hours).toBe(0);
    expect(result.current.minutes).toBe(0);
    expect(result.current.isUrgent).toBe(true);
  });

  it('calculates hours and minutes correctly', () => {
    const deadline = new Date(Date.now() + 5 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useCountdown(deadline));

    expect(result.current.hours).toBe(5);
    expect(result.current.minutes).toBe(30);
    expect(result.current.isExpired).toBe(false);
    expect(result.current.isUrgent).toBe(true);
    expect(result.current.isCritical).toBe(false);
    expect(result.current.label).toBe('Respond within 5 hours 30 minutes');
  });

  it('marks as urgent when less than 24h remaining', () => {
    const deadline = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useCountdown(deadline));

    expect(result.current.isUrgent).toBe(true);
    expect(result.current.isExpired).toBe(false);
  });

  it('marks as not urgent when more than 24h remaining', () => {
    const deadline = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useCountdown(deadline));

    expect(result.current.isUrgent).toBe(false);
    expect(result.current.isExpired).toBe(false);
    expect(result.current.isCritical).toBe(false);
  });

  it('marks as critical when less than 2h remaining', () => {
    const deadline = new Date(Date.now() + 1 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useCountdown(deadline));

    expect(result.current.isCritical).toBe(true);
    expect(result.current.isUrgent).toBe(true);
    expect(result.current.label).toBe('Respond within 1 hour 15 minutes');
  });

  it('formats label without hours when less than 1h', () => {
    const deadline = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useCountdown(deadline));

    expect(result.current.label).toBe('Respond within 45 minutes');
    expect(result.current.isCritical).toBe(true);
  });

  it('uses singular form for 1 hour 1 minute', () => {
    const deadline = new Date(Date.now() + 1 * 60 * 60 * 1000 + 1 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useCountdown(deadline));

    expect(result.current.label).toBe('Respond within 1 hour 1 minute');
  });

  it('uses singular form for 1 minute', () => {
    const deadline = new Date(Date.now() + 1 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useCountdown(deadline));

    expect(result.current.label).toBe('Respond within 1 minute');
  });

  it('updates every minute', () => {
    const deadline = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useCountdown(deadline));

    expect(result.current.minutes).toBe(3);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.minutes).toBe(2);
  });

  it('stops interval when expired', () => {
    const deadline = new Date(Date.now() + 60_000).toISOString();
    const { result } = renderHook(() => useCountdown(deadline));

    expect(result.current.isExpired).toBe(false);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.isExpired).toBe(true);
  });

  it('cleans up interval on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { unmount } = renderHook(() => useCountdown(deadline));

    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  // WI-W1 (#486, #472): onExpire must fire at the real deadline, not only on the
  // next 60s tick. A 90s deadline falls mid-interval; the tick-only code would not
  // call onExpire until the 120s tick.
  it('fires onExpire at the deadline even when it falls between minute ticks', () => {
    const onExpire = vi.fn();
    const deadline = new Date(Date.now() + 90_000).toISOString();
    const { result } = renderHook(() => useCountdown(deadline, onExpire));

    expect(result.current.isExpired).toBe(false);

    act(() => {
      vi.advanceTimersByTime(90_000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(result.current.isExpired).toBe(true);
  });

  // WI-W1 (#501, #472): when the deadline transitions from a value to undefined
  // (e.g. a refetch clears it), the result must reset to the empty/expired baseline
  // rather than keep stale label/minutes.
  it('resets to the empty state when the deadline is cleared', () => {
    const deadline = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    const { result, rerender } = renderHook(
      ({ d }: { d: string | undefined }) => useCountdown(d),
      { initialProps: { d: deadline as string | undefined } },
    );

    expect(result.current.label).toBe('Respond within 5 hours 0 minutes');
    expect(result.current.isExpired).toBe(false);

    act(() => {
      rerender({ d: undefined });
    });

    expect(result.current.isExpired).toBe(true);
    expect(result.current.label).toBe('');
    expect(result.current.hours).toBe(0);
    expect(result.current.minutes).toBe(0);
  });

  it('does not schedule an overflowing timeout for very distant deadlines', () => {
    // setTimeout overflows past ~24.8 days; the hook must not blow up or fire early.
    const onExpire = vi.fn();
    const deadline = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString(); // 40 days
    const { result } = renderHook(() => useCountdown(deadline, onExpire));

    expect(result.current.isExpired).toBe(false);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onExpire).not.toHaveBeenCalled();
    expect(result.current.isExpired).toBe(false);
  });
});
