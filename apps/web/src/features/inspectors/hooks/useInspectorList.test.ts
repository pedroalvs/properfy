import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { apiClient } from '@/lib/api-client';
import { useInspectorList } from './useInspectorList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_INSPECTORS = [
  { id: 'insp-01', name: 'Carlos Silva', email: 'carlos@inspecoes.com', status: 'ACTIVE' },
  { id: 'insp-02', name: 'Fernanda Lima', email: 'fernanda@inspecoes.com', status: 'INACTIVE' },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: MOCK_INSPECTORS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  });
});

describe('useInspectorList', () => {
  it('returns data after loading resolves', async () => {
    const wrapper = createQueryWrapper();
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
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorList(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/inspectors', expect.any(Object));
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });
});
