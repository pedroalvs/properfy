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
import { useEligibleAppointments } from './useEligibleAppointments';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_APPOINTMENTS = [
  { id: 'apt-01', code: 'VST-001', propertyAddress: '123 Main St', scheduledDate: '2026-04-01', status: 'AWAITING_INSPECTOR' },
  { id: 'apt-02', code: 'VST-002', propertyAddress: '456 Oak Ave', scheduledDate: '2026-04-02', status: 'AWAITING_INSPECTOR' },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: {
      data: MOCK_APPOINTMENTS,
      pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
    },
  });
});

describe('useEligibleAppointments', () => {
  it('returns data when serviceTypeId is provided', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useEligibleAppointments('st-01', 'tenant-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0]?.code).toBe('VST-001');
  });

  it('does not fetch when serviceTypeId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useEligibleAppointments(null, 'tenant-1'), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toHaveLength(0);
  });

  it('returns empty array when loading', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useEligibleAppointments('st-01', 'tenant-1'), { wrapper });

    expect(result.current.data).toHaveLength(0);
  });

  it('calls API with correct params', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useEligibleAppointments('st-01', 'tenant-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/appointments', {
      params: {
        query: expect.objectContaining({
          serviceTypeId: 'st-01',
          tenantId: 'tenant-1',
          ungroupedOnly: 'true',
          pageSize: '100',
        }),
      },
    });
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useEligibleAppointments('st-01', 'tenant-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('does not fetch for global flow until tenant is selected', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useEligibleAppointments('st-01', ''), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toHaveLength(0);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
