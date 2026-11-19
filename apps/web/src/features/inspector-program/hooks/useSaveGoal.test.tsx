import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useSaveGoal } from './useSaveGoal';

vi.mock('@/services/api', () => ({ api: { POST: vi.fn(), PATCH: vi.fn() } }));
import { api } from '@/services/api';
const mockPost = api.POST as unknown as Mock;
const mockPatch = api.PATCH as unknown as Mock;

beforeEach(() => {
  mockPost.mockReset();
  mockPatch.mockReset();
});

describe('useSaveGoal', () => {
  it('creates a goal via POST with the exact body', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'g1' } }, error: undefined });
    const { result } = renderHook(() => useSaveGoal(), { wrapper: createQueryWrapper() });
    const body = {
      title: 'Weekly ten',
      metric: 'VOLUME' as const,
      period: 'WEEKLY' as const,
      target: 10,
      rewardAmount: 30,
      startsAt: '2026-11-02',
    };
    const created = await result.current.createGoal(body);
    expect(mockPost).toHaveBeenCalledWith('/v1/inspector-program/goals', { body });
    expect(created.id).toBe('g1');
  });

  it('updates a goal via PATCH with only the changed fields', async () => {
    mockPatch.mockResolvedValue({ data: { data: { id: 'g1' } }, error: undefined });
    const { result } = renderHook(() => useSaveGoal(), { wrapper: createQueryWrapper() });
    await result.current.updateGoal({ goalId: 'g1', patch: { target: 12, rewardAmount: 40 } });
    expect(mockPatch).toHaveBeenCalledWith('/v1/inspector-program/goals/{goalId}', {
      params: { path: { goalId: 'g1' } },
      body: { target: 12, rewardAmount: 40 },
    });
  });

  it('deactivate/reactivate are PATCH { active }', async () => {
    mockPatch.mockResolvedValue({ data: { data: { id: 'g1' } }, error: undefined });
    const { result } = renderHook(() => useSaveGoal(), { wrapper: createQueryWrapper() });
    await result.current.updateGoal({ goalId: 'g1', patch: { active: false } });
    expect(mockPatch).toHaveBeenLastCalledWith('/v1/inspector-program/goals/{goalId}', {
      params: { path: { goalId: 'g1' } },
      body: { active: false },
    });
  });

  it('throws an ApiError (with status) on 422 so the form can surface it', async () => {
    mockPost.mockResolvedValue({ data: undefined, error: { code: 'GOAL_END_IN_CURRENT_PERIOD', message: 'Too soon' }, response: { status: 422 } });
    const { result } = renderHook(() => useSaveGoal(), { wrapper: createQueryWrapper() });
    await expect(
      result.current.createGoal({
        title: 'x', metric: 'VOLUME', period: 'WEEKLY', target: 1, rewardAmount: 1, startsAt: '2026-11-02',
      }),
    ).rejects.toMatchObject({ status: 422 });
    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });
});
