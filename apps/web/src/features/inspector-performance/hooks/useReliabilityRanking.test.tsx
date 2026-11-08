import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useReliabilityRanking } from './useReliabilityRanking';
import { rankingEnvelope, rankingFixture } from '../__fixtures__/reliability';

vi.mock('@/services/api', () => ({ api: { GET: vi.fn() } }));
import { api } from '@/services/api';
const mockGet = api.GET as unknown as Mock;

beforeEach(() => mockGet.mockReset());

describe('useReliabilityRanking', () => {
  it('fetches the ranking, keyed on ["reliability","ranking"], unwrapping data.data', async () => {
    mockGet.mockResolvedValue({ data: rankingEnvelope(), error: undefined });
    const { result } = renderHook(() => useReliabilityRanking(), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.ranking).not.toBeNull());
    expect(mockGet).toHaveBeenCalledWith('/v1/dashboard/inspector-performance');
    expect(result.current.ranking).toEqual(rankingFixture);
    expect(result.current.isError).toBe(false);
  });

  it('reports an error state when the request fails', async () => {
    mockGet.mockResolvedValue({ data: undefined, error: { code: 'INTERNAL', message: 'boom' } });
    const { result } = renderHook(() => useReliabilityRanking(), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.ranking).toBeNull();
  });
});
