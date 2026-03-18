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
});
