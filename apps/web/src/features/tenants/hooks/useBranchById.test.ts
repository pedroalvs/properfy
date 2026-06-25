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
import { useBranchById } from './useBranchById';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_BRANCH = {
  id: 'br-01',
  tenantId: 'ten-01',
  name: 'Centro',
  addressJson: {
    formattedAddress: 'Rua Augusta, 100, Sao Paulo SP 01000-000, BR',
    street: 'Rua Augusta, 100',
    suburb: 'Sao Paulo',
    postcode: '01000-000',
    state: 'SP',
    country: 'BR',
    latitude: -23.55,
    longitude: -46.63,
    provider: 'MAPBOX',
  },
  contactEmail: 'centro@imob.com',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  mockGet.mockReset();
});

describe('useBranchById', () => {
  it('does not fetch when tenantId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchById(null, 'br-01'), { wrapper });
    expect(result.current.isPending).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not fetch when branchId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchById('ten-01', null), { wrapper });
    expect(result.current.isPending).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches branch by id and returns formatted address', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: MOCK_BRANCH }, error: undefined });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchById('ten-01', 'br-01'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith(
      '/v1/tenants/{tenantId}/branches/{branchId}',
      { params: { path: { tenantId: 'ten-01', branchId: 'br-01' } } },
    );
    expect(result.current.data?.id).toBe('br-01');
    expect(result.current.data?.address).toBeTruthy();
  });

  it('returns error state on API failure', async () => {
    mockGet.mockResolvedValueOnce({
      data: undefined,
      error: { error: { message: 'Not found' } },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchById('ten-01', 'br-99'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Not found');
  });
});
