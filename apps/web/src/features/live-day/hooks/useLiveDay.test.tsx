import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useLiveDay } from './useLiveDay';

const getMock = vi.fn();
vi.mock('@/services/api', () => ({ api: { GET: (...args: unknown[]) => getMock(...args) } }));

function resp(over?: { today?: string; date?: string }) {
  return {
    data: {
      data: {
        date: over?.date ?? '2026-11-05',
        today: over?.today ?? '2026-11-05',
        timezone: 'Australia/Sydney',
        isToday: true,
        generatedAt: '2026-11-05T00:00:00Z',
        thresholdsDefault: { delayMinutes: 20, notStartedMinutes: 30 },
        summary: {
          inspectors: 0,
          notStarted: 0,
          atProperty: 0,
          inTransit: 0,
          doneForDay: 0,
          needsAttention: 0,
          stopsDone: 0,
          stopsTotal: 0,
        },
        inspectors: [],
      },
    },
    error: undefined,
  };
}

/** Extract the query object of the Nth api.GET call. */
function queryOf(call: number) {
  return (getMock.mock.calls[call]![1] as { params: { query: Record<string, unknown> } }).params.query;
}

beforeEach(() => {
  getMock.mockReset();
  getMock.mockResolvedValue(resp());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLiveDay', () => {
  it('sends includeGeometry=none and no inspectorId/date when mode is none and date is null', async () => {
    const { result } = renderHook(
      () => useLiveDay({ date: null, geometryMode: 'none', selectedId: null }),
      { wrapper: createQueryWrapper() },
    );
    await waitFor(() => expect(result.current.liveDay).not.toBeNull());
    const q = queryOf(0);
    expect(q.includeGeometry).toBe('none');
    expect(q.inspectorId).toBeUndefined();
    expect(q.date).toBeUndefined();
  });

  it('sends includeGeometry=selected with the inspectorId', async () => {
    const { result } = renderHook(
      () => useLiveDay({ date: '2026-11-05', geometryMode: 'selected', selectedId: 'insp-1' }),
      { wrapper: createQueryWrapper() },
    );
    await waitFor(() => expect(result.current.liveDay).not.toBeNull());
    const q = queryOf(0);
    expect(q.includeGeometry).toBe('selected');
    expect(q.inspectorId).toBe('insp-1');
    expect(q.date).toBe('2026-11-05');
  });

  it('sends includeGeometry=all with no inspectorId', async () => {
    const { result } = renderHook(
      () => useLiveDay({ date: null, geometryMode: 'all', selectedId: 'insp-1' }),
      { wrapper: createQueryWrapper() },
    );
    await waitFor(() => expect(result.current.liveDay).not.toBeNull());
    const q = queryOf(0);
    expect(q.includeGeometry).toBe('all');
    expect(q.inspectorId).toBeUndefined();
  });

  it('keeps the previous data while a selection change refetches (no flicker)', async () => {
    let resolveSecond: (value: unknown) => void = () => {};
    getMock.mockResolvedValueOnce(resp({ date: '2026-11-05' }));
    const wrapper = createQueryWrapper();
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useLiveDay({ date: '2026-11-05', geometryMode: 'selected', selectedId: id }),
      { wrapper, initialProps: { id: 'J' } },
    );
    await waitFor(() => expect(result.current.liveDay).not.toBeNull());

    // Second fetch (T) hangs; the hook must retain J's data meanwhile.
    getMock.mockReturnValueOnce(
      new Promise((r) => {
        resolveSecond = r as (value: unknown) => void;
      }),
    );
    rerender({ id: 'T' });
    expect(result.current.liveDay).not.toBeNull();
    resolveSecond(resp({ date: '2026-11-05' }));
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
  });

  it('exposes isRefetchError and keeps data when a poll fails after a success', async () => {
    getMock.mockResolvedValueOnce(resp());
    const { result } = renderHook(
      () => useLiveDay({ date: '2026-11-05', geometryMode: 'none', selectedId: null }),
      { wrapper: createQueryWrapper() },
    );
    await waitFor(() => expect(result.current.liveDay).not.toBeNull());
    getMock.mockRejectedValueOnce(new Error('boom'));
    await result.current.refetch();
    await waitFor(() => expect(result.current.isRefetchError).toBe(true));
    expect(result.current.liveDay).not.toBeNull();
  });

  it('polls every 30s for today but never for a past day (server today)', async () => {
    vi.useFakeTimers();
    // Browser clock far ahead; the server frames "today" as 2026-11-05.
    vi.setSystemTime(new Date('2026-11-10T00:00:00Z'));

    // Today → polls.
    getMock.mockResolvedValue(resp({ today: '2026-11-05', date: '2026-11-05' }));
    const today = renderHook(
      () => useLiveDay({ date: '2026-11-05', geometryMode: 'none', selectedId: null }),
      { wrapper: createQueryWrapper() },
    );
    await vi.waitFor(() => expect(today.result.current.liveDay).not.toBeNull());
    expect(getMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    // Unmount so its 30s interval cannot leak into the past-day assertions below.
    today.unmount();

    // Past day → no polling.
    getMock.mockReset();
    getMock.mockResolvedValue(resp({ today: '2026-11-05', date: '2026-11-04' }));
    const past = renderHook(
      () => useLiveDay({ date: '2026-11-04', geometryMode: 'none', selectedId: null }),
      { wrapper: createQueryWrapper() },
    );
    await vi.waitFor(() => expect(past.result.current.liveDay).not.toBeNull());
    expect(getMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});
