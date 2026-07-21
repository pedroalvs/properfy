import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { useAppointmentMapData } from './useAppointmentMapData';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_DATA = [
  {
    id: 'apt-1',
    code: 'VST-001',
    status: 'SCHEDULED',
    address: '123 Main St',
    latitude: -33.8688,
    longitude: 151.2093,
    scheduledDate: '2026-04-01',
    timeSlotStart: '09:00', timeSlotEnd: '12:00',
    inspectorName: 'John',
    branchName: 'Central',
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

describe('useAppointmentMapData', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({
      data: {
        data: MOCK_DATA,
        pagination: { page: 1, pageSize: 200, total: 1, totalPages: 1 },
      },
    });
  });

  it('returns loading state initially', () => {
    const { result } = renderHook(() => useAppointmentMapData(), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it('returns data after fetch', async () => {
    const { result } = renderHook(() => useAppointmentMapData(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });
    expect(result.current.data[0]!.code).toBe('VST-001');
  });

  it('returns error state on failure', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useAppointmentMapData(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('initializes with default filters', () => {
    const { result } = renderHook(() => useAppointmentMapData(), {
      wrapper: createWrapper(),
    });
    expect(result.current.filters).toEqual({
      status: '',
      dateFrom: '',
      dateTo: '',
      branchId: '',
    });
  });
});
