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
      '/appointments?status=DONE&rentalTenantConfirmationStatus=NO_RESPONSE&startDate=2026-03-01&endDate=2026-03-31',
    );
    const { result } = renderHook(() => useAppointmentList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.filters.status).toBe('DONE');
    expect(result.current.filters.rentalTenantConfirmationStatus).toBe('NO_RESPONSE');
    expect(result.current.filters.startDate).toBe('2026-03-01');
    expect(result.current.filters.endDate).toBe('2026-03-31');
    expect(mockGet).toHaveBeenCalledWith('/v1/appointments', {
      params: {
        query: expect.objectContaining({
          status: 'DONE',
          rentalTenantConfirmationStatus: 'NO_RESPONSE',
          fromDate: '2026-03-01',
          toDate: '2026-03-31',
        }),
      },
    });
  });

  it('forwards the agency and inspector filters to the API', async () => {
    const wrapper = createRouterQueryWrapper('/appointments?tenantId=tenant-1&inspectorId=insp-1');
    const { result } = renderHook(() => useAppointmentList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.filters.tenantId).toBe('tenant-1');
    expect(result.current.filters.inspectorId).toBe('insp-1');
    expect(mockGet).toHaveBeenCalledWith('/v1/appointments', {
      params: {
        query: expect.objectContaining({ tenantId: 'tenant-1', inspectorId: 'insp-1' }),
      },
    });
  });

  it('omits the agency and inspector params when unset', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useAppointmentList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const query = mockGet.mock.calls.at(-1)?.[1]?.params?.query as Record<string, unknown>;
    expect(query.tenantId).toBeUndefined();
    expect(query.inspectorId).toBeUndefined();
  });

  it('forwards the suburb and confirmation-email filters to the API', async () => {
    const wrapper = createRouterQueryWrapper('/appointments?suburb=Bondi&confirmationStatus=not_sent');
    const { result } = renderHook(() => useAppointmentList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.filters.suburb).toBe('Bondi');
    expect(result.current.filters.confirmationStatus).toBe('not_sent');
    expect(mockGet).toHaveBeenCalledWith('/v1/appointments', {
      params: {
        query: expect.objectContaining({ suburb: 'Bondi', confirmationStatus: 'not_sent' }),
      },
    });
  });

  it('omits the suburb and confirmation-email params when unset', async () => {
    const wrapper = createRouterQueryWrapper();
    const { result } = renderHook(() => useAppointmentList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const query = mockGet.mock.calls.at(-1)?.[1]?.params?.query as Record<string, unknown>;
    expect(query.suburb).toBeUndefined();
    expect(query.confirmationStatus).toBeUndefined();
  });

  // DataTable sorts the current page client-side. Sending sortBy/sortOrder would
  // reorder the server-side window and change WHICH rows come back.
  it('never sends sortBy or sortOrder', async () => {
    const wrapper = createRouterQueryWrapper('/appointments?suburb=Bondi');
    const { result } = renderHook(() => useAppointmentList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const query = mockGet.mock.calls.at(-1)?.[1]?.params?.query as Record<string, unknown>;
    expect(query.sortBy).toBeUndefined();
    expect(query.sortOrder).toBeUndefined();
  });
});
