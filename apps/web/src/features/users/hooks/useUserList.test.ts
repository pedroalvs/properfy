import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-99', name: 'Test', email: 'test@test.com', role: 'AM', tenantId: 'tenant-1' },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

import { apiClient } from '@/lib/api-client';
import { useUserList } from './useUserList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_USERS = [
  { id: 'usr-01', name: 'Admin Principal', email: 'admin@properfy.com', role: 'AM', status: 'ACTIVE' },
  { id: 'usr-02', name: 'Ana Gestora', email: 'ana@imobiliaria.com', role: 'CL_ADMIN', status: 'ACTIVE' },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: MOCK_USERS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  });
});

describe('useUserList', () => {
  it('returns data after loading resolves', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserList(), { wrapper });

    expect(result.current.data).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0]?.name).toBe('Admin Principal');
  });

  it('initially shows loading then resolves', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('calls API with tenant-scoped path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/tenants/tenant-1/users', expect.any(Object));
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });
});
