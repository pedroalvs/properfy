import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useLockedTime } from './useLockedTime';

const getMock = vi.fn();
vi.mock('@/services/api', () => ({ api: { GET: (...args: unknown[]) => getMock(...args) } }));

function resp(from = '2026-11-05', to = '2026-11-18') {
  return {
    data: {
      data: {
        from,
        to,
        generatedAt: '2026-11-05T00:00:00.000Z',
        overall: { confirmed: 2, required: 3, percent: 66.7 },
        byAgency: [{ tenantId: 't1', agencyName: 'Ray White', confirmed: 2, required: 3, percent: 66.7 }],
        byRegion: [
          { regionId: 'r1', regionName: 'North', agencyName: 'Ray White', confirmed: 2, required: 3, percent: 66.7 },
          { regionId: null, regionName: 'No region', agencyName: null, confirmed: 0, required: 0, percent: null },
        ],
      },
    },
    error: undefined,
  };
}

beforeEach(() => {
  getMock.mockReset();
  getMock.mockResolvedValue(resp());
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useLockedTime', () => {
  it('requests the range anchored on today (preset 14 → today..today+13)', async () => {
    const { result } = renderHook(() => useLockedTime('2026-11-05', 14), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(getMock).toHaveBeenCalledWith('/v1/dashboard/locked-time', {
      params: { query: { from: '2026-11-05', to: '2026-11-18' } },
    });
    expect(result.current.range).toEqual({ from: '2026-11-05', to: '2026-11-18' });
    expect(result.current.data?.overall.percent).toBe(66.7);
  });

  it('anchors on the passed today even if the Inspectors tab is on a past day (L-F05-09)', async () => {
    // The caller passes data.today, never the selected Inspectors date.
    const { result } = renderHook(() => useLockedTime('2026-11-05', 7), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(getMock).toHaveBeenCalledWith('/v1/dashboard/locked-time', {
      params: { query: { from: '2026-11-05', to: '2026-11-11' } },
    });
  });

  it('does not poll (no refetchInterval)', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLockedTime('2026-11-05', 14), { wrapper: createQueryWrapper() });
    await vi.waitFor(() => expect(result.current.data).not.toBeNull());
    expect(getMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the error state', async () => {
    getMock.mockResolvedValue({ data: undefined, error: { error: { code: 'BOOM', message: 'nope' } } });
    const { result } = renderHook(() => useLockedTime('2026-11-05', 14), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
