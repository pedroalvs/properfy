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

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { api } from '@/services/api';
import { useAppointmentList } from './useAppointmentList';
import { createRouterQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_APPOINTMENTS = [
  { id: 'apt-01', code: 'VST-001', status: 'DONE', contactName: 'João' },
  { id: 'apt-02', code: 'VST-002', status: 'SCHEDULED', contactName: 'Maria' },
];

function mockPaginatedResponse(data = MOCK_APPOINTMENTS) {
  return {
    data: {
      data,
      pagination: { page: 1, pageSize: 10, total: data.length, totalPages: 1 },
    },
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue(mockPaginatedResponse());
});

describe('useAppointmentList', () => {
  it('returns data after loading resolves', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useAppointmentList(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0]?.code).toBe('VST-001');
  });

  it('initially shows loading then resolves', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useAppointmentList(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('calls API with correct path', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useAppointmentList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/appointments', { params: { query: expect.any(Object) } });
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useAppointmentList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });

  it('exposes filters and setFilters', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useAppointmentList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.filters).toBeDefined();
    expect(typeof result.current.setFilters).toBe('function');
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useAppointmentList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('initializes supported filters from query params', async () => {
    const wrapper = createRouterQueryWrapper(
      '/appointments?status=DONE&tenantConfirmationStatus=NO_RESPONSE&startDate=2026-03-01&endDate=2026-03-31',
    );
    const { result } = renderHook(() => useAppointmentList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.filters.status).toBe('DONE');
    expect(result.current.filters.tenantConfirmationStatus).toBe('NO_RESPONSE');
    expect(result.current.filters.startDate).toBe('2026-03-01');
    expect(result.current.filters.endDate).toBe('2026-03-31');
    expect(mockGet).toHaveBeenCalledWith('/v1/appointments', {
      params: {
        query: expect.objectContaining({
          status: 'DONE',
          tenantConfirmationStatus: 'NO_RESPONSE',
          fromDate: '2026-03-01',
          toDate: '2026-03-31',
        }),
      },
    });
  });
});
