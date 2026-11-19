import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as UseApiQueryModule from '@/hooks/useApiQuery';
import { usePreviewDayPlanOrder } from '../usePreviewDayPlanOrder';

const mockPost = vi.fn();
vi.mock('@/hooks/useApiQuery', async (importOriginal) => {
  const actual = await importOriginal<typeof UseApiQueryModule>();
  return { ...actual, apiPost: (...args: unknown[]) => mockPost(...args) };
});

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const DATE = '2026-11-05';

function previewOk(order: string[]) {
  return {
    data: {
      etaSource: 'MATRIX',
      approximate: false,
      approximateReason: null,
      departureAt: null,
      finishEta: '2026-11-04T23:30:00.000Z',
      totals: { driveS: 3300, waitS: 0, serviceS: 5400, lateS: 0, distanceM: null },
      feasible: true,
      violations: [],
      stops: order.map((id, i) => ({ appointmentId: id, sequence: i + 1, eta: null, travelS: 0, waitS: 0, lateS: 0 })),
    },
  };
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => mockPost.mockReset());

describe('usePreviewDayPlanOrder — debounce (fake timers)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('previews the initial order on mount, then debounces a changed order by 400 ms', async () => {
    mockPost.mockResolvedValue(previewOk([A, B]));
    const { rerender } = renderHook(
      ({ order }) => usePreviewDayPlanOrder(DATE, 2, order, { enabled: true, debounceMs: 400 }),
      { wrapper: makeWrapper(), initialProps: { order: [A, B] } },
    );
    // The initial order fires immediately (no change to debounce).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenLastCalledWith(`/v1/inspector/day-plans/${DATE}/order/preview`, {
      appointmentIds: [A, B],
      basedOnVersion: 2,
    });

    // A changed order waits for the window to elapse.
    rerender({ order: [B, A] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost).toHaveBeenLastCalledWith(`/v1/inspector/day-plans/${DATE}/order/preview`, {
      appointmentIds: [B, A],
      basedOnVersion: 2,
    });
  });

  it('coalesces a burst of moves into a single request for the latest order', async () => {
    mockPost.mockResolvedValue(previewOk([A, B]));
    const { rerender } = renderHook(
      ({ order }) => usePreviewDayPlanOrder(DATE, 2, order, { enabled: true, debounceMs: 400 }),
      { wrapper: makeWrapper(), initialProps: { order: [A, B] } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    mockPost.mockClear();
    rerender({ order: [B, A] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    rerender({ order: [A, B] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    // Back to [A,B]: cached, no new network call; and [B,A] was never requested.
    expect(mockPost).not.toHaveBeenCalledWith(expect.anything(), { appointmentIds: [B, A], basedOnVersion: 2 });
  });
});

describe('usePreviewDayPlanOrder — states (real timers)', () => {
  it('is disabled below two ids', () => {
    mockPost.mockResolvedValue(previewOk([A]));
    const { result } = renderHook(() => usePreviewDayPlanOrder(DATE, 2, [A], { enabled: true, debounceMs: 0 }), {
      wrapper: makeWrapper(),
    });
    expect(result.current.phase).toBe('IDLE');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('is disabled when enabled is false', () => {
    mockPost.mockResolvedValue(previewOk([A, B]));
    const { result } = renderHook(() => usePreviewDayPlanOrder(DATE, 2, [A, B], { enabled: false, debounceMs: 0 }), {
      wrapper: makeWrapper(),
    });
    expect(result.current.phase).toBe('IDLE');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('maps a settled success to SUCCESS with the response data', async () => {
    mockPost.mockResolvedValue(previewOk([A, B]));
    const { result } = renderHook(() => usePreviewDayPlanOrder(DATE, 2, [A, B], { enabled: true, debounceMs: 0 }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.phase).toBe('SUCCESS'));
    expect(result.current.data?.finishEta).toBe('2026-11-04T23:30:00.000Z');
  });
});
