import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

import { api } from '@/services/api';
import { useArchiveInspectorNotice } from './useArchiveInspectorNotice';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

function wrapperWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { Wrapper, invalidate };
}

beforeEach(() => {
  mockPost.mockReset();
});

describe('useArchiveInspectorNotice', () => {
  it('POSTs to the archive route, invalidates the list and calls onArchived', async () => {
    mockPost.mockResolvedValue({ data: {} });
    const onArchived = vi.fn();
    const { Wrapper, invalidate } = wrapperWithClient();
    const { result } = renderHook(() => useArchiveInspectorNotice('n1', onArchived), { wrapper: Wrapper });

    await act(async () => {
      await result.current.archive();
    });
    expect(onArchived).toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith('/v1/inspector-notices/{noticeId}/archive', {
      params: { path: { noticeId: 'n1' } },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inspector-notices'] });
  });

  it('rejects on error without calling onArchived', async () => {
    mockPost.mockResolvedValue({ error: { error: { code: 'BOOM', message: 'x' } }, response: { status: 500 } });
    const onArchived = vi.fn();
    const { Wrapper } = wrapperWithClient();
    const { result } = renderHook(() => useArchiveInspectorNotice('n1', onArchived), { wrapper: Wrapper });

    await act(async () => {
      await expect(result.current.archive()).rejects.toMatchObject({ status: 500 });
    });
    expect(onArchived).not.toHaveBeenCalled();
  });
});
