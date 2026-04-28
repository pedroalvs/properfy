import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import type { ReactNode } from 'react';

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

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { useServiceGroupMapData } from './useServiceGroupMapData';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_DATA = [
  {
    id: 'sg-1',
    name: 'Sydney East',
    regionName: 'Eastern Suburbs',
    status: 'PUBLISHED',
    priorityMode: 'STANDARD',
    appointmentsCount: 3,
    appointments: [
      { id: 'apt-1', code: 'VST-001', status: 'SCHEDULED', address: '123 Main St', latitude: -33.8, longitude: 151.2 },
    ],
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

describe('useServiceGroupMapData', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({
      data: {
        data: MOCK_DATA,
        pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      },
    });
  });

  it('returns loading state initially', () => {
    const { result } = renderHook(() => useServiceGroupMapData(), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it('returns data after fetch', async () => {
    const { result } = renderHook(() => useServiceGroupMapData(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });
    expect(result.current.data[0]!.name).toBe('Sydney East');
  });

  it('manages selected group state', () => {
    const { result } = renderHook(() => useServiceGroupMapData(), {
      wrapper: createWrapper(),
    });
    expect(result.current.selectedGroupId).toBeNull();
  });

  it('returns error state on failure', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useServiceGroupMapData(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  // Date filter parity with AppointmentMapPage.
  it('includes dateFrom and dateTo in default filters', () => {
    const { result } = renderHook(() => useServiceGroupMapData(), {
      wrapper: createWrapper(),
    });
    expect(result.current.filters.dateFrom).toBe('');
    expect(result.current.filters.dateTo).toBe('');
  });

  it('updates dateFrom filter and refetches', async () => {
    const { result } = renderHook(() => useServiceGroupMapData(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    act(() => {
      result.current.setFilters({ ...result.current.filters, dateFrom: '2026-05-01' });
    });

    expect(result.current.filters.dateFrom).toBe('2026-05-01');
  });

  it('updates dateTo filter', async () => {
    const { result } = renderHook(() => useServiceGroupMapData(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    act(() => {
      result.current.setFilters({ ...result.current.filters, dateTo: '2026-05-31' });
    });

    expect(result.current.filters.dateTo).toBe('2026-05-31');
  });
});
