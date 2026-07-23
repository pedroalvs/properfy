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
import { useBranchList } from './useBranchList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_BRANCHES = [
  { id: 'br-01', tenantId: 'ten-01', name: 'Centro', addressJson: { formattedAddress: 'Rua Augusta, 100, Sao Paulo SP 01000-000, BR' }, contactEmail: 'centro@imob.com', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'br-02', tenantId: 'ten-01', name: 'Zona Sul', addressJson: null, contactEmail: null, status: 'INACTIVE', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_BRANCHES,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

describe('useBranchList', () => {
  it('returns branch data after loading', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchList('ten-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0]?.name).toBe('Centro');
    expect(result.current.data[0]?.address).toContain('Rua Augusta');
  });

  it('does not fetch when tenantId is null', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchList(null), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.data).toHaveLength(0);
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchList('ten-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchList('ten-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('keeps a stable data array reference across re-renders with unchanged data', async () => {
    // Regression guard for the PR #961 bug class: an unstable reference here
    // can feed a consumer effect (e.g. deps [isEditMode, entity]) whose
    // setState calls re-render into an infinite loop that starves router
    // updates — URL changes but the screen never swaps.
    const wrapper = createQueryWrapper();
    const { result, rerender } = renderHook(() => useBranchList('ten-01'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const first = result.current.data;
    expect(first).not.toBeNull();
    rerender();
    expect(result.current.data).toBe(first);
  });
});
