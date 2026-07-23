import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { useInspectorList } from './useInspectorList';
import { createRouterQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_INSPECTORS = [
  { id: 'insp-01', name: 'Carlos Silva', email: 'carlos@inspecoes.com', status: 'ACTIVE' },
  { id: 'insp-02', name: 'Fernanda Lima', email: 'fernanda@inspecoes.com', status: 'INACTIVE' },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_INSPECTORS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

describe('useInspectorList', () => {
  it('returns data after loading resolves', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useInspectorList(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0]?.name).toBe('Carlos Silva');
  });

  it('initially shows loading then resolves', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useInspectorList(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('calls API with correct path', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useInspectorList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/inspectors', { params: { query: expect.any(Object) } });
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useInspectorList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useInspectorList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('keeps a stable data array reference across re-renders with unchanged data', async () => {
    // Regression guard for the PR #961 bug class: an unstable reference here
    // can feed a consumer effect (e.g. deps [isEditMode, entity]) whose
    // setState calls re-render into an infinite loop that starves router
    // updates — URL changes but the screen never swaps.
    const wrapper = createRouterQueryWrapper();
    const { result, rerender } = renderHook(() => useInspectorList(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const first = result.current.data;
    expect(first).not.toBeNull();
    rerender();
    expect(result.current.data).toBe(first);
  });
});
