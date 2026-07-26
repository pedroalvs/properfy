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
import { useFinancialEntryDetail } from './useFinancialEntryDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_ENTRY = {
  id: 'fin-01',
  entryType: 'TENANT_DEBIT',
  appointmentCode: 'VIST-001',
  description: 'Debit entry',
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_ENTRY } });
});

describe('useFinancialEntryDetail', () => {
  it('returns entry by id', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntryDetail('fin-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.entry?.appointmentCode).toBe('VIST-001');
  });

  it('returns null when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntryDetail(null), { wrapper });

    expect(result.current.entry).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntryDetail('fin-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.entry).toBeNull();
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntryDetail('fin-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/financial/entries/fin-01', { params: { query: undefined } });
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Not found' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useFinancialEntryDetail('fin-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.entry).toBeNull();
  });

  it('keeps a stable entry reference across re-renders with unchanged data', async () => {
    // Regression guard for the PR #961 bug class: an unstable reference here
    // can feed a consumer effect (e.g. deps [isEditMode, entity]) whose
    // setState calls re-render into an infinite loop that starves router
    // updates — URL changes but the screen never swaps.
    const wrapper = createQueryWrapper();
    const { result, rerender } = renderHook(() => useFinancialEntryDetail('fin-01'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const first = result.current.entry;
    expect(first).not.toBeNull();
    rerender();
    expect(result.current.entry).toBe(first);
  });
});
