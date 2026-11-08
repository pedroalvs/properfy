import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useGoal } from './useGoal';

vi.mock('@/services/api', () => ({ api: { GET: vi.fn() } }));
import { api } from '@/services/api';
const mockGet = api.GET as unknown as Mock;

beforeEach(() => mockGet.mockReset());

describe('useGoal', () => {
  it('is disabled without an id', () => {
    const { result } = renderHook(() => useGoal(null), { wrapper: createQueryWrapper() });
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.goal).toBeNull();
  });

  it('fetches a goal by id and unwraps data.data', async () => {
    mockGet.mockResolvedValue({ data: { data: { id: 'g1', title: 'Weekly ten' } }, error: undefined });
    const { result } = renderHook(() => useGoal('g1'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.goal).not.toBeNull());
    expect(mockGet).toHaveBeenCalledWith('/v1/inspector-program/goals/{goalId}', {
      params: { path: { goalId: 'g1' } },
    });
    expect(result.current.goal?.id).toBe('g1');
  });

  it('flags a 404 as isNotFound', async () => {
    mockGet.mockResolvedValue({ data: undefined, error: { code: 'NOT_FOUND', message: 'gone' }, response: { status: 404 } });
    const { result } = renderHook(() => useGoal('missing'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isNotFound).toBe(true);
  });
});
