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
import { useTenantAdminList } from './useTenantAdminList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_TENANTS = [
  { id: 'ten-01', name: 'Imob Alpha', legalName: 'Alpha LTDA', status: 'ACTIVE', branchCount: 3, timezone: 'America/Sao_Paulo', currency: 'BRL', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'ten-02', name: 'Imob Beta', legalName: null, status: 'PENDING', branchCount: 0, timezone: 'America/Sao_Paulo', currency: 'BRL', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_TENANTS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

describe('useTenantAdminList', () => {
  it('returns data after loading resolves', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminList(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0]?.name).toBe('Imob Alpha');
  });

  it('initially shows loading then resolves', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminList(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/tenants', { params: { query: expect.any(Object) } });
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('exposes filters and setFilters', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantAdminList(), { wrapper });

    expect(result.current.filters).toEqual({ search: '', status: '' });
    expect(typeof result.current.setFilters).toBe('function');
  });
});
