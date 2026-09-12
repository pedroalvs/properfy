import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { DEFAULT_FILTERS, type UserScope } from '../types';

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
import { useUserList } from './useUserList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_USERS = [
  { id: 'usr-01', name: 'Admin Principal', email: 'admin@properfy.me', role: 'AM', status: 'ACTIVE' },
  { id: 'usr-02', name: 'Ana Gestora', email: 'ana@imobiliaria.com', role: 'CL_ADMIN', status: 'ACTIVE' },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_USERS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
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

    expect(mockGet).toHaveBeenCalledWith('/v1/tenants/tenant-1/users', { params: { query: expect.any(Object) } });
  });

  it('pagination total reflects API response', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.pagination.total).toBe(2);
  });

  it('calls internal users endpoint when scope is internal', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserList(undefined, 'internal'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/users', { params: { query: expect.any(Object) } });
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Network error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });

  it('resets to page 1 whenever filters change', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUserList(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.pagination.onChange?.(3, 10);
    });
    expect(result.current.pagination.page).toBe(3);

    act(() => {
      result.current.setFilters({ ...DEFAULT_FILTERS, search: 'ana' });
    });

    expect(result.current.filters.search).toBe('ana');
    expect(result.current.pagination.page).toBe(1);
  });

  it('resets filters and page when the scope changes', async () => {
    const wrapper = createQueryWrapper();
    const { result, rerender } = renderHook(
      ({ scope }: { scope: UserScope }) => useUserList(undefined, scope),
      { wrapper, initialProps: { scope: 'tenant' as UserScope } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setFilters({ search: 'ana', role: 'CL_ADMIN', status: 'ACTIVE' });
      result.current.pagination.onChange?.(3, 10);
    });
    await waitFor(() => expect(result.current.filters.role).toBe('CL_ADMIN'));

    // Switching scope must clear the previous scope's filters and reset to page 1.
    rerender({ scope: 'internal' });

    await waitFor(() => {
      expect(result.current.filters).toEqual(DEFAULT_FILTERS);
    });
    expect(result.current.pagination.page).toBe(1);
  });

  it('resets filters and page when the selected agency changes within tenant scope', async () => {
    const wrapper = createQueryWrapper();
    const { result, rerender } = renderHook(
      ({ agencyId }: { agencyId: string }) => useUserList(agencyId, 'tenant'),
      { wrapper, initialProps: { agencyId: 'tenant-1' } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setFilters({ search: '', role: 'CL_ADMIN', status: '' });
      result.current.pagination.onChange?.(2, 10);
    });
    await waitFor(() => expect(result.current.filters.role).toBe('CL_ADMIN'));

    rerender({ agencyId: 'tenant-2' });

    await waitFor(() => {
      expect(result.current.filters).toEqual(DEFAULT_FILTERS);
    });
    expect(result.current.pagination.page).toBe(1);
  });
});
