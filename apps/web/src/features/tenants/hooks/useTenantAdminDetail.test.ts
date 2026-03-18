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
import { useTenantAdminDetail } from './useTenantAdminDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_TENANT = {
  id: 'ten-01',
  name: 'Imob Alpha',
  legalName: 'Alpha LTDA',
  status: 'ACTIVE',
  branchCount: 3,
  timezone: 'America/Sao_Paulo',
  currency: 'AUD',
  settings: {},
  notes: 'Test notes',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_TENANT } });
});

describe('useTenantAdminDetail', () => {
  it('returns tenant data after loading', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminDetail('ten-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.tenant).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.tenant?.name).toBe('Imob Alpha');
    expect(result.current.tenant?.notes).toBe('Test notes');
  });

  it('does not fetch when id is null', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminDetail(null), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.tenant).toBeNull();
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Not found' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminDetail('ten-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.tenant).toBeNull();
  });
});
