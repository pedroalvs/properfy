import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useGoals } from './useGoals';

vi.mock('@/services/api', () => ({ api: { GET: vi.fn() } }));
import { api } from '@/services/api';
const mockGet = api.GET as unknown as Mock;

beforeEach(() => mockGet.mockReset());

const goal = { id: 'g1', title: 'Weekly ten' };

describe('useGoals', () => {
  it('fetches goals with filters and unwraps data + meta', async () => {
    mockGet.mockResolvedValue({ data: { data: [goal], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }, error: undefined });
    const { result } = renderHook(() => useGoals({ active: true, metric: 'VOLUME', period: 'WEEKLY' }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.goals.length).toBe(1));
    expect(mockGet).toHaveBeenCalledWith('/v1/inspector-program/goals', {
      params: { query: { active: true, metric: 'VOLUME', period: 'WEEKLY' } },
    });
    expect(result.current.meta?.total).toBe(1);
  });

  it('omits undefined filters from the query (Status=All → no active)', async () => {
    mockGet.mockResolvedValue({ data: { data: [] }, error: undefined });
    const { result } = renderHook(() => useGoals({ active: undefined }), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith('/v1/inspector-program/goals', { params: { query: {} } });
  });

  it('reports an error state on failure', async () => {
    mockGet.mockResolvedValue({ data: undefined, error: { code: 'INTERNAL', message: 'boom' }, response: { status: 500 } });
    const { result } = renderHook(() => useGoals(), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.goals).toEqual([]);
  });
});
