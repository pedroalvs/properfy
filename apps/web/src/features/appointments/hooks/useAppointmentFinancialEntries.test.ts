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
import { useAppointmentFinancialEntries } from './useAppointmentFinancialEntries';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_ENTRIES = [
  {
    id: 'fin-01',
    entryType: 'TENANT_DEBIT',
    amount: 150.0,
    currency: 'AUD',
    status: 'PENDING',
    description: 'Inspection fee',
    relatedEntityName: 'Branch Centro',
    effectiveAt: '2026-03-10T00:00:00Z',
    createdAt: '2026-03-10T10:00:00Z',
  },
  {
    id: 'fin-02',
    entryType: 'INSPECTOR_PAYOUT',
    amount: 100.0,
    currency: 'AUD',
    status: 'APPROVED',
    description: 'Inspector payment',
    relatedEntityName: 'Inspector João',
    effectiveAt: '2026-03-11T00:00:00Z',
    createdAt: '2026-03-11T14:00:00Z',
  },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: { data: MOCK_ENTRIES, pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 } },
  });
});

describe('useAppointmentFinancialEntries', () => {
  it('returns financial entries for an appointment', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentFinancialEntries('apt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0]!.entryType).toBe('TENANT_DEBIT');
  });

  it('returns empty list when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentFinancialEntries(null), { wrapper });

    expect(result.current.entries).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentFinancialEntries('apt-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Server error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAppointmentFinancialEntries('apt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.entries).toEqual([]);
  });
});
