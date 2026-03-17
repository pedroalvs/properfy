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
import { useDashboardStats } from './useDashboardStats';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_STATS = {
  appointmentsByStatus: {
    draft: 2,
    awaitingInspector: 3,
    scheduled: 4,
    doneThisMonth: 3,
  },
  recentAppointments: [
    { id: 'apt-15', code: 'VST-015' },
    { id: 'apt-14', code: 'VST-014' },
    { id: 'apt-13', code: 'VST-013' },
    { id: 'apt-12', code: 'VST-012' },
    { id: 'apt-07', code: 'VST-007' },
  ],
  pendingActions: {
    noResponseTenants: 2,
    pendingFinancialEntries: 5,
    processingReports: 2,
  },
  quickStats: {
    totalProperties: 15,
    activeInspectors: 12,
    activeServiceGroups: 9,
  },
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: MOCK_STATS });
});

describe('useDashboardStats', () => {
  it('returns null stats while loading', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    expect(result.current.stats).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns stats after loading resolves', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats).not.toBeNull();
  });

  it('has correct appointment status counts', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const { appointmentsByStatus } = result.current.stats!;
    expect(appointmentsByStatus.draft).toBe(2);
    expect(appointmentsByStatus.awaitingInspector).toBe(3);
    expect(appointmentsByStatus.scheduled).toBe(4);
    expect(appointmentsByStatus.doneThisMonth).toBe(3);
  });

  it('has 5 recent appointments', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats!.recentAppointments).toHaveLength(5);
  });

  it('has correct pending actions counts', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const { pendingActions } = result.current.stats!;
    expect(pendingActions.noResponseTenants).toBe(2);
    expect(pendingActions.pendingFinancialEntries).toBe(5);
    expect(pendingActions.processingReports).toBe(2);
  });

  it('has correct quick stats counts', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const { quickStats } = result.current.stats!;
    expect(quickStats.totalProperties).toBe(15);
    expect(quickStats.activeInspectors).toBe(12);
    expect(quickStats.activeServiceGroups).toBe(9);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.stats).toBeNull();
  });
});
