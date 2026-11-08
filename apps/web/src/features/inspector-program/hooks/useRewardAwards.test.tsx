import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useRewardAwards } from './useRewardAwards';

vi.mock('@/services/api', () => ({ api: { GET: vi.fn() } }));
import { api } from '@/services/api';
const mockGet = api.GET as unknown as Mock;

beforeEach(() => mockGet.mockReset());

describe('useRewardAwards', () => {
  it('is disabled until a period is chosen', () => {
    const { result } = renderHook(() => useRewardAwards({ periodType: 'WEEKLY', periodStart: null }), {
      wrapper: createQueryWrapper(),
    });
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.awards).toEqual([]);
  });

  it('fetches awards for the period with optional filters', async () => {
    mockGet.mockResolvedValue({ data: { data: [{ id: 'a1' }] }, error: undefined });
    const { result } = renderHook(
      () => useRewardAwards({ periodType: 'WEEKLY', periodStart: '2026-11-02', status: 'PENDING' }),
      { wrapper: createQueryWrapper() },
    );
    await waitFor(() => expect(result.current.awards.length).toBe(1));
    expect(mockGet).toHaveBeenCalledWith('/v1/inspector-program/awards', {
      params: { query: { periodType: 'WEEKLY', periodStart: '2026-11-02', status: 'PENDING' } },
    });
  });
});
