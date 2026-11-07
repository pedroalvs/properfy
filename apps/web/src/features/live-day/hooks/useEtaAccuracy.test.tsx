import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useEtaAccuracy } from './useEtaAccuracy';

const getMock = vi.fn();
vi.mock('@/services/api', () => ({ api: { GET: (...args: unknown[]) => getMock(...args) } }));

function resp() {
  return {
    data: {
      data: {
        days: 30,
        sampleSize: 214,
        excludedOutliers: 2,
        meanAbsoluteErrorMinutes: 6.2,
        thresholdMinutes: 10,
        minSampleSize: 30,
        status: 'OK',
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

describe('useEtaAccuracy', () => {
  it('requests eta-accuracy with days=30', async () => {
    const { result } = renderHook(() => useEtaAccuracy(), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.accuracy).not.toBeNull());
    expect(getMock).toHaveBeenCalledWith('/v1/day-plans/eta-accuracy', {
      params: { query: { days: 30 } },
    });
    expect(result.current.accuracy?.status).toBe('OK');
  });

  it('does not poll (no refetchInterval)', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEtaAccuracy(), { wrapper: createQueryWrapper() });
    await vi.waitFor(() => expect(result.current.accuracy).not.toBeNull());
    expect(getMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});
