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
import { useReportList } from './useReportList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_REPORTS = [
  { id: 'rpt-01', reportType: 'APPOINTMENTS', status: 'COMPLETED', requestedByName: 'Admin Principal' },
  { id: 'rpt-02', reportType: 'FINANCIAL_SERVICES', status: 'PROCESSING', requestedByName: 'Admin Principal' },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: MOCK_REPORTS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  });
});

describe('useReportList', () => {
  it('returns data after loading resolves', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useReportList(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
  });

  it('initially shows loading then resolves', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useReportList(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useReportList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/reports', expect.any(Object));
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useReportList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useReportList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });
});
