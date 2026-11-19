import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useRewardAwardAction } from './useRewardAwardAction';

vi.mock('@/services/api', () => ({ api: { POST: vi.fn() } }));
import { api } from '@/services/api';
const mockPost = api.POST as unknown as Mock;

beforeEach(() => mockPost.mockReset());

function keyOf(callIndex: number): string {
  return mockPost.mock.calls[callIndex]![1].headers['Idempotency-Key'];
}

describe('useRewardAwardAction', () => {
  it('approves with an Idempotency-Key header', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'a1' } }, error: undefined });
    const { result } = renderHook(() => useRewardAwardAction(), { wrapper: createQueryWrapper() });
    await act(async () => {
      await result.current.approve('a1');
    });
    expect(mockPost).toHaveBeenCalledWith('/v1/inspector-program/awards/{awardId}/approve', {
      params: { path: { awardId: 'a1' } },
      headers: { 'Idempotency-Key': expect.any(String) },
    });
  });

  it('voids with the reason + optional inspector note', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'a1' } }, error: undefined });
    const { result } = renderHook(() => useRewardAwardAction(), { wrapper: createQueryWrapper() });
    await act(async () => {
      await result.current.voidAward({ awardId: 'a1', reason: 'Agency rejected the job', inspectorNote: 'Sorry' });
    });
    expect(mockPost).toHaveBeenCalledWith('/v1/inspector-program/awards/{awardId}/void', {
      params: { path: { awardId: 'a1' } },
      headers: { 'Idempotency-Key': expect.any(String) },
      body: { reason: 'Agency rejected the job', inspectorNote: 'Sorry' },
    });
  });

  it('collapses a double-click to a single POST', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'a1' } }, error: undefined });
    const { result } = renderHook(() => useRewardAwardAction(), { wrapper: createQueryWrapper() });
    await act(async () => {
      const p1 = result.current.approve('a1');
      const p2 = result.current.approve('a1');
      await Promise.all([p1, p2]);
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('reuses the Idempotency-Key when the same action is retried after a failure', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { code: 'INTERNAL', message: 'boom' }, response: { status: 500 } });
    mockPost.mockResolvedValueOnce({ data: { data: { id: 'a1' } }, error: undefined });
    const { result } = renderHook(() => useRewardAwardAction(), { wrapper: createQueryWrapper() });
    await act(async () => {
      await expect(result.current.approve('a1')).rejects.toMatchObject({ status: 500 });
    });
    await act(async () => {
      await result.current.approve('a1');
    });
    expect(keyOf(0)).toBe(keyOf(1));
  });

  it('surfaces a 409 as an ApiError with status', async () => {
    mockPost.mockResolvedValue({ data: undefined, error: { code: 'CONFLICT', message: 'stale' }, response: { status: 409 } });
    const { result } = renderHook(() => useRewardAwardAction(), { wrapper: createQueryWrapper() });
    await act(async () => {
      await expect(result.current.approve('a1')).rejects.toMatchObject({ status: 409 });
    });
    await waitFor(() => expect(result.current.pendingId).toBeNull());
  });
});
