import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

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
import { usePricingRuleList } from './usePricingRuleList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_RULES = [
  { id: 'pr-01', tenantId: 'ten-1', currency: 'USD', serviceTypeId: 'st-1', branchId: null, priceAmount: 150, payoutType: 'FIXED', payoutValue: 100, bonusRuleJson: null, status: 'ACTIVE', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z' },
  { id: 'pr-02', tenantId: 'ten-2', currency: 'AUD', serviceTypeId: 'st-2', branchId: 'br-1', priceAmount: 200, payoutType: 'PERCENTAGE', payoutValue: 70, bonusRuleJson: null, status: 'ACTIVE', createdAt: '2026-03-02T10:00:00Z', updatedAt: '2026-03-02T10:00:00Z' },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_RULES,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

describe('usePricingRuleList', () => {
  it('returns data after loading resolves', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePricingRuleList(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePricingRuleList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/pricing-rules', { params: { query: expect.any(Object) } });
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePricingRuleList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePricingRuleList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  // ── Behavioral coverage (#730) ──────────────────────────────────────────

  it('re-issues the query with updated params when a filter changes (#730)', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePricingRuleList(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockGet.mockClear();

    act(() => {
      result.current.setFilters((f) => ({ ...f, status: 'ACTIVE' }));
    });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/v1/pricing-rules', {
        params: { query: expect.objectContaining({ status: 'ACTIVE' }) },
      });
    });
  });

  it('resets to page 1 when a filter changes (#612)', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePricingRuleList(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.pagination.onChange(3, 10); });
    await waitFor(() => expect(result.current.pagination.page).toBe(3));

    mockGet.mockClear();
    act(() => { result.current.setFilters((f) => ({ ...f, status: 'INACTIVE' })); });

    await waitFor(() => expect(result.current.pagination.page).toBe(1));
    expect(mockGet).toHaveBeenCalledWith('/v1/pricing-rules', {
      params: { query: expect.objectContaining({ page: '1' }) },
    });
  });

  it('re-issues the query when pagination changes', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePricingRuleList(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockGet.mockClear();

    act(() => { result.current.pagination.onChange(2, 10); });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/v1/pricing-rules', {
        params: { query: expect.objectContaining({ page: '2' }) },
      });
    });
  });
});
