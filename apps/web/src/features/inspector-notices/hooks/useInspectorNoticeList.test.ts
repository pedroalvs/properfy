import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

import { api } from '@/services/api';
import { useInspectorNoticeList } from './useInspectorNoticeList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } });
});

describe('useInspectorNoticeList', () => {
  it('defaults to the active status and a page size of 20', async () => {
    const { result } = renderHook(() => useInspectorNoticeList(), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status).toBe('active');
    expect(mockGet).toHaveBeenCalledWith('/v1/inspector-notices', {
      params: { query: expect.objectContaining({ status: 'active', pageSize: '20', page: '1' }) },
    });
  });

  it('resets to page 1 when the status filter changes', async () => {
    const { result } = renderHook(() => useInspectorNoticeList(), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.pagination.onChange(3, 20));
    await waitFor(() => expect(result.current.pagination.page).toBe(3));
    mockGet.mockClear();
    act(() => result.current.setStatus('archived'));
    await waitFor(() => expect(result.current.pagination.page).toBe(1));
    expect(mockGet).toHaveBeenCalledWith('/v1/inspector-notices', {
      params: { query: expect.objectContaining({ status: 'archived', page: '1' }) },
    });
  });
});
