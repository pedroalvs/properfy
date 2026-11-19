import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

import { api } from '@/services/api';
import { useActiveRegionOptions } from './useActiveRegionOptions';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
});

describe('useActiveRegionOptions', () => {
  it('returns regions with their inspectorCount', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          { id: 'r1', name: 'North Shore', inspectorCount: 8 },
          { id: 'r2', name: 'Inner West', inspectorCount: 0 },
        ],
        pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
      },
    });
    const { result } = renderHook(() => useActiveRegionOptions(true), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.options).toEqual([
      { id: 'r1', name: 'North Shore', inspectorCount: 8 },
      { id: 'r2', name: 'Inner West', inspectorCount: 0 },
    ]);
    expect(mockGet).toHaveBeenCalledWith('/v1/service-regions', {
      params: { query: expect.objectContaining({ status: 'ACTIVE', pageSize: '100' }) },
    });
  });

  it('surfaces a load error', async () => {
    mockGet.mockResolvedValue({ error: { error: { code: 'BOOM', message: 'nope' } }, response: { status: 500 } });
    const { result } = renderHook(() => useActiveRegionOptions(true), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.options).toEqual([]);
  });
});
