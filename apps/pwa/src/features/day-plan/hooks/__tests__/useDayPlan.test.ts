import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ApiError } from '@properfy/shared';
import { useDayPlan } from '../useDayPlan';
import { buildDayPlan } from '../../__fixtures__/day-plan';

const mockGet = vi.fn();
vi.mock('@/services/api', () => ({
  api: { GET: (...args: unknown[]) => mockGet(...args) },
}));

const DATE = '2026-11-05';

/** Wrapper that mirrors the production retry policy (skip 4xx, else <2) but with
 * zero backoff so the 5xx-retry path is fast. */
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'offlineFirst',
        gcTime: Infinity,
        retry: (failureCount: number, error: unknown) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
        retryDelay: 0,
      },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

function ok(plan = buildDayPlan()) {
  return { data: { data: plan }, error: undefined, response: { status: 200 } };
}
function httpError(status: number, code: string) {
  return { data: undefined, error: { error: { code, message: code } }, response: { status } };
}

beforeEach(() => {
  mockGet.mockReset();
});

describe('useDayPlan', () => {
  it('returns the plan on 200 and hits the dated endpoint', async () => {
    mockGet.mockResolvedValue(ok());
    const { result } = renderHook(() => useDayPlan(DATE), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.state).toBe('OK'));
    expect(result.current.data?.date).toBe(DATE);
    expect(mockGet).toHaveBeenCalledWith('/v1/inspector/day-plans/2026-11-05', expect.anything());
  });

  it('maps 404 DAY_PLAN_NOT_PUBLISHED to NOT_PUBLISHED without retrying', async () => {
    mockGet.mockResolvedValue(httpError(404, 'DAY_PLAN_NOT_PUBLISHED'));
    const { result } = renderHook(() => useDayPlan(DATE), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.state).toBe('NOT_PUBLISHED'));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('maps 404 DAY_PLAN_NOT_FOUND to NOT_FOUND', async () => {
    mockGet.mockResolvedValue(httpError(404, 'DAY_PLAN_NOT_FOUND'));
    const { result } = renderHook(() => useDayPlan(DATE), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.state).toBe('NOT_FOUND'));
  });

  it('refetches once after 2s when the plan is STALE, then holds for the same version', async () => {
    vi.useFakeTimers();
    try {
      mockGet
        .mockResolvedValueOnce(ok(buildDayPlan({ status: 'STALE', version: 3 })))
        .mockResolvedValue(ok(buildDayPlan({ status: 'STALE', version: 3 })));
      const { result } = renderHook(() => useDayPlan(DATE), { wrapper: makeWrapper() });
      await vi.waitFor(() => expect(result.current.state).toBe('STALE'));
      expect(mockGet).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
      // Same version came back STALE: no further automatic refetch.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(mockGet).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refetches once per version when STALE advances to a new version', async () => {
    vi.useFakeTimers();
    try {
      mockGet
        .mockResolvedValueOnce(ok(buildDayPlan({ status: 'STALE', version: 3 })))
        .mockResolvedValueOnce(ok(buildDayPlan({ status: 'STALE', version: 4 })))
        .mockResolvedValue(ok(buildDayPlan({ status: 'STALE', version: 4 })));
      const { result } = renderHook(() => useDayPlan(DATE), { wrapper: makeWrapper() });
      await vi.waitFor(() => expect(result.current.state).toBe('STALE'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      await vi.waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(mockGet).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the cached plan and flags offline on a network error', async () => {
    mockGet.mockResolvedValueOnce(ok());
    const { result } = renderHook(() => useDayPlan(DATE), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.state).toBe('OK'));

    mockGet.mockRejectedValue(new TypeError('Failed to fetch'));
    await act(async () => {
      result.current.refetch();
    });
    await waitFor(() => expect(result.current.isOffline).toBe(true));
    expect(result.current.data?.date).toBe(DATE); // cache retained
  });

  it('exposes ERROR on a 5xx (after the provider retries)', async () => {
    mockGet.mockResolvedValue(httpError(500, 'INTERNAL'));
    const { result } = renderHook(() => useDayPlan(DATE), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.state).toBe('ERROR'));
    expect(mockGet).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(result.current.isOffline).toBe(false);
  });

  it('makes no request when disabled', () => {
    mockGet.mockResolvedValue(ok());
    renderHook(() => useDayPlan(DATE, { enabled: false }), { wrapper: makeWrapper() });
    expect(mockGet).not.toHaveBeenCalled();
  });
});
