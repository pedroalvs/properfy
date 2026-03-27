import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { api } from '@/services/api';
import { createQueryWrapper } from '@/test-utils/test-wrappers';
import { useTimeSlotList } from './useTimeSlotAdmin';

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

const mockGet = api.GET as ReturnType<typeof vi.fn>;

describe('useTimeSlotList', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: [] } });
  });

  it('does not query when tenantId is missing', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTimeSlotList(undefined), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([]);
  });

  it('queries the tenant-scoped list when tenantId exists', async () => {
    const wrapper = createQueryWrapper();
    renderHook(() => useTimeSlotList('tenant-1', 'branch-1'), { wrapper });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/v1/time-slots', {
        params: { query: { includeInactive: 'true', tenantId: 'tenant-1', branchId: 'branch-1' } },
      });
    });
  });
});
