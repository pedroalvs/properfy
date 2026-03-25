import { describe, it, expect, vi, beforeEach } from 'vitest';
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
import { useSlotList } from './useSlotList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_SLOTS = [
  {
    id: 'slot-01',
    inspectorId: 'insp-01',
    inspectorName: 'Diego',
    date: '2026-03-20',
    startTime: '08:00',
    endTime: '12:00',
    region: 'North Zone',
    capacity: 3,
    bookedCount: 1,
    status: 'AVAILABLE',
    createdAt: '2026-03-17T10:00:00Z',
  },
  {
    id: 'slot-02',
    inspectorId: 'insp-02',
    inspectorName: 'Carlos',
    date: '2026-03-21',
    startTime: '13:00',
    endTime: '17:00',
    region: 'South Zone',
    capacity: 2,
    bookedCount: 2,
    status: 'BOOKED',
    createdAt: '2026-03-17T11:00:00Z',
  },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: {
      data: MOCK_SLOTS,
      pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    },
  });
});

describe('useSlotList', () => {
  it('returns loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSlotList(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('returns data after fetch resolves', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSlotList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0]!.inspectorName).toBe('Diego');
    expect(result.current.data[1]!.inspectorName).toBe('Carlos');
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSlotList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/availability-slots', {
      params: { query: expect.any(Object) },
    });
  });

  it('does not send unsupported search param', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSlotList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setFilters({
        inspectorId: 'insp-01',
        status: 'AVAILABLE',
        dateFrom: '2026-03-20',
        dateTo: '2026-03-21',
      });
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith('/v1/availability-slots', {
        params: {
          query: expect.objectContaining({
            inspectorId: 'insp-01',
            status: 'AVAILABLE',
            dateFrom: '2026-03-20',
            dateTo: '2026-03-21',
          }),
        },
      });
    });

    const lastCall = mockGet.mock.calls.at(-1)?.[1] as { params?: { query?: Record<string, string> } } | undefined;
    expect(lastCall?.params?.query).not.toHaveProperty('search');
  });

  it('returns error state on failure', async () => {
    mockGet.mockResolvedValueOnce({
      data: undefined,
      error: { message: 'Network error' },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSlotList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });
});
