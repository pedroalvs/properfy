import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

import { api } from '@/services/api';
import { usePublishInspectorNotice } from './usePublishInspectorNotice';
import type { PublishInspectorNoticeInput } from '@properfy/shared';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

const INPUT: PublishInspectorNoticeInput = {
  title: 'Road closure',
  body: 'Pacific Hwy closed',
  critical: true,
  audience: { type: 'ALL' },
};

function wrapperWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { Wrapper, invalidate };
}

function keyOf(callIndex: number): string {
  return mockPost.mock.calls[callIndex]![1].headers['Idempotency-Key'];
}

beforeEach(() => {
  mockPost.mockReset();
});

describe('usePublishInspectorNotice', () => {
  it('POSTs the body with an Idempotency-Key header and returns the result', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'n1', recipientCount: 12 } } });
    const { Wrapper, invalidate } = wrapperWithClient();
    const { result } = renderHook(() => usePublishInspectorNotice(), { wrapper: Wrapper });

    let res: { id: string; recipientCount: number } | undefined;
    await act(async () => {
      res = await result.current.publish(INPUT);
    });

    expect(res).toEqual({ id: 'n1', recipientCount: 12 });
    expect(mockPost).toHaveBeenCalledWith('/v1/inspector-notices', {
      body: INPUT,
      headers: { 'Idempotency-Key': expect.any(String) },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inspector-notices'] });
  });

  it('throws an ApiError carrying the backend status and code', async () => {
    mockPost.mockResolvedValue({
      error: { error: { code: 'INSPECTOR_NOTICE_NO_RECIPIENTS', message: 'none' } },
      response: { status: 422 },
    });
    const { Wrapper } = wrapperWithClient();
    const { result } = renderHook(() => usePublishInspectorNotice(), { wrapper: Wrapper });

    await expect(result.current.publish(INPUT)).rejects.toMatchObject({
      status: 422,
      code: 'INSPECTOR_NOTICE_NO_RECIPIENTS',
    });
  });

  it('reuses the key on retry and rotates it after a success', async () => {
    const { Wrapper } = wrapperWithClient();
    const { result } = renderHook(() => usePublishInspectorNotice(), { wrapper: Wrapper });

    // First attempt fails (network).
    mockPost.mockRejectedValueOnce(new TypeError('offline'));
    await act(async () => {
      await result.current.publish(INPUT).catch(() => undefined);
    });
    // Retry succeeds — must carry the SAME key.
    mockPost.mockResolvedValueOnce({ data: { data: { id: 'n1', recipientCount: 1 } } });
    await act(async () => {
      await result.current.publish(INPUT);
    });
    expect(keyOf(0)).toBe(keyOf(1));

    // A fresh publish after success rotates the key.
    mockPost.mockResolvedValueOnce({ data: { data: { id: 'n2', recipientCount: 1 } } });
    await act(async () => {
      await result.current.publish(INPUT);
    });
    expect(keyOf(2)).not.toBe(keyOf(1));
  });

  it('resetKey rotates the key for the next submission', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'n1', recipientCount: 1 } } });
    const { Wrapper } = wrapperWithClient();
    const { result } = renderHook(() => usePublishInspectorNotice(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.publish(INPUT);
    });
    act(() => result.current.resetKey());
    await act(async () => {
      await result.current.publish(INPUT);
    });
    expect(keyOf(0)).not.toBe(keyOf(1));
  });
});
