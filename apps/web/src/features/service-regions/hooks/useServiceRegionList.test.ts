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
import { useServiceRegionList } from './useServiceRegionList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: { data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } },
  });
});

describe('useServiceRegionList', () => {
  it('resets to page 1 when a filter changes, so the new result set is requested from the start (#612)', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceRegionList(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Move to page 3.
    act(() => { result.current.pagination.onChange(3, 10); });
    await waitFor(() => expect(result.current.pagination.page).toBe(3));

    // Changing a filter must snap back to page 1.
    mockGet.mockClear();
    act(() => { result.current.setFilters({ search: 'north', status: '' }); });

    await waitFor(() => expect(result.current.pagination.page).toBe(1));
    expect(mockGet).toHaveBeenCalledWith('/v1/service-regions', {
      params: { query: expect.objectContaining({ page: '1', search: 'north' }) },
    });
  });
});
