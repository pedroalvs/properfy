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

import { api } from '@/services/api';
import { useUserDetail } from './useUserDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_USER = {
  id: 'usr-01',
  name: 'Admin Principal',
  email: 'admin@properfy.com',
  role: 'AM',
  status: 'ACTIVE',
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_USER } });
});

describe('useUserDetail', () => {
  it('returns user by id', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserDetail('usr-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).not.toBeNull();
    expect(result.current.user?.name).toBe('Admin Principal');
  });

  it('returns null when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserDetail(null), { wrapper });

    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserDetail('usr-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it('calls API with tenant-scoped path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserDetail('usr-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/tenants/tenant-1/users/usr-01', { params: { query: undefined } });
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Not found' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserDetail('usr-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it('calls internal user endpoint when scope is internal', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserDetail('usr-01', undefined, 'internal'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/users/usr-01', { params: { query: undefined } });
  });
});
