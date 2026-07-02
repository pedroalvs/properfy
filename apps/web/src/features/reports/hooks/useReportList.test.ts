import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

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

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { api } from '@/services/api';
import { useReportList } from './useReportList';
import { createRouterQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_REPORTS = [
  { id: 'rpt-01', reportType: 'APPOINTMENTS', status: 'READY', requestedBy: { id: 'u-1', name: 'Admin Principal' } },
  { id: 'rpt-02', reportType: 'FINANCIAL', status: 'READY', requestedBy: { id: 'u-1', name: 'Admin Principal' } },
];

beforeEach(() => {
  vi.useRealTimers();
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_REPORTS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useReportList', () => {
  it('returns data after loading resolves', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useReportList(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
  });

  it('initially shows loading then resolves', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useReportList(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('calls API with correct path', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useReportList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/reports', { params: { query: expect.any(Object) } });
  });

  it('includes supported backend filters in the query params', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useReportList(), { wrapper });

    act(() => {
      result.current.setFilters({
        reportType: 'FINANCIAL',
        status: 'FAILED',
        fromDate: '2026-03-01',
        toDate: '2026-03-31',
      });
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith('/v1/reports', {
        params: {
          query: expect.objectContaining({
            reportType: 'FINANCIAL',
            status: 'FAILED',
            fromDate: '2026-03-01',
            toDate: '2026-03-31',
          }),
        },
      });
    });
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useReportList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useReportList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('initializes supported filters from query params', async () => {
    const wrapper = createRouterQueryWrapper(
      '/reports?reportType=FINANCIAL&status=PROCESSING&fromDate=2026-03-01&toDate=2026-03-31',
    );
    const { result } = renderHook(() => useReportList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.filters.reportType).toBe('FINANCIAL');
    expect(result.current.filters.status).toBe('PROCESSING');
    expect(result.current.filters.fromDate).toBe('2026-03-01');
    expect(result.current.filters.toDate).toBe('2026-03-31');
    expect(mockGet).toHaveBeenCalledWith('/v1/reports', {
      params: {
        query: expect.objectContaining({
          reportType: 'FINANCIAL',
          status: 'PROCESSING',
          fromDate: '2026-03-01',
          toDate: '2026-03-31',
        }),
      },
    });
  });

  it('polls while a report is pending or processing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet.mockResolvedValue({
      data: {
        data: [
          { id: 'rpt-01', reportType: 'APPOINTMENTS', status: 'PROCESSING', requestedBy: { id: 'u-1', name: 'Admin Principal' } },
        ],
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
      },
    });

    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useReportList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(mockGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });

  it('stops polling when all reports are ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useReportList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(mockGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
