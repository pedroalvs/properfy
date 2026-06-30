import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockGET = vi.fn();

vi.mock('@/services/api', () => ({
  api: {
    GET: (...args: unknown[]) => mockGET(...args),
  },
}));

import { useDashboardStats } from './useDashboardStats';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const MOCK_STATS = {
  appointmentsByStatus: {
    draft: 2,
    awaitingInspector: 3,
    scheduled: 4,
    doneThisMonth: 3,
  },
  recentAppointments: [
    { id: 'apt-15', code: 'VST-015', propertyAddress: 'Address 15', status: 'SCHEDULED', doneCheckedByUserId: null, scheduledDate: '2026-04-01' },
    { id: 'apt-14', code: 'VST-014', propertyAddress: 'Address 14', status: 'DONE', doneCheckedByUserId: null, scheduledDate: '2026-03-31' },
    { id: 'apt-13', code: 'VST-013', propertyAddress: 'Address 13', status: 'SCHEDULED', doneCheckedByUserId: null, scheduledDate: '2026-03-30' },
    { id: 'apt-12', code: 'VST-012', propertyAddress: 'Address 12', status: 'DRAFT', doneCheckedByUserId: null, scheduledDate: '2026-03-29' },
    { id: 'apt-07', code: 'VST-007', propertyAddress: 'Address 07', status: 'DONE', doneCheckedByUserId: 'op-1', scheduledDate: '2026-03-28' },
  ],
  pendingActions: {
    noResponseRentalTenants: 2,
    pendingOperatorCrossChecks: 3,
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
  mockGET.mockReset();
  mockGET.mockResolvedValue({ data: { data: MOCK_STATS }, error: undefined });
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
    expect(pendingActions.noResponseRentalTenants).toBe(2);
    expect(pendingActions.pendingOperatorCrossChecks).toBe(3);
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
    mockGET.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useDashboardStats(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.stats).toBeNull();
  });
});
