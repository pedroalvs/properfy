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
import { useMarketplaceOffers } from './useMarketplaceOffers';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_OFFERS = [
  {
    id: 'off-01',
    groupId: 'grp-01',
    groupName: 'Sydney CBD',
    regionName: 'NSW',
    priorityMode: 'STANDARD',
    appointmentsCount: 3,
    totalPayout: 450,
    expiresAt: '2026-04-01T00:00:00Z',
    createdAt: '2026-03-15T00:00:00Z',
    appointments: [
      { id: 'apt-01', code: 'APT-001', address: '123 George St', scheduledDate: '2026-03-20', timeSlot: '09:00-12:00', latitude: -33.8688, longitude: 151.2093 },
    ],
  },
  {
    id: 'off-02',
    groupId: 'grp-02',
    groupName: 'Melbourne Inner',
    regionName: 'VIC',
    priorityMode: 'PRIORITY_24H',
    appointmentsCount: 1,
    totalPayout: 200,
    expiresAt: '2026-03-20T00:00:00Z',
    createdAt: '2026-03-16T00:00:00Z',
    appointments: [],
  },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: {
      data: MOCK_OFFERS,
      pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    },
  });
});

describe('useMarketplaceOffers', () => {
  it('returns loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useMarketplaceOffers(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('returns data after fetch resolves', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useMarketplaceOffers(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0]?.groupName).toBe('Sydney CBD');
    expect(result.current.data[1]?.groupName).toBe('Melbourne Inner');
  });

  it('returns error state on API failure', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useMarketplaceOffers(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useMarketplaceOffers(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/marketplace/offers', { params: { query: expect.any(Object) } });
  });

  it('exposes filters and setFilters', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useMarketplaceOffers(), { wrapper });

    expect(result.current.filters).toEqual({ search: '', priorityMode: '', dateFrom: '', dateTo: '' });
    expect(typeof result.current.setFilters).toBe('function');
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useMarketplaceOffers(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });
});
