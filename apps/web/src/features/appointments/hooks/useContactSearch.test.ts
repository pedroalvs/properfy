import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));

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
import { useContactSearch } from './useContactSearch';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_CONTACTS = {
  data: [
    { id: 'c-1', displayName: 'John Doe', primaryEmail: 'john@test.com', primaryPhone: '11999', type: 'TENANT', isActive: true },
    { id: 'c-2', displayName: 'Jane Smith', primaryEmail: 'jane@test.com', primaryPhone: null, type: 'PROPERTY_MANAGER', isActive: true },
  ],
  pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
};

beforeEach(() => {
  vi.useFakeTimers();
  mockGet.mockResolvedValue({ data: MOCK_CONTACTS, error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useContactSearch', () => {
  it('starts with empty state', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactSearch(), { wrapper });

    expect(result.current.search).toBe('');
    expect(result.current.debouncedSearch).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  });

  it('debounces search input', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactSearch(), { wrapper });

    act(() => {
      result.current.setSearch('Jo');
    });

    expect(result.current.search).toBe('Jo');
    expect(result.current.debouncedSearch).toBe('');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.debouncedSearch).toBe('Jo');
  });

  it('reset clears search state', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactSearch(), { wrapper });

    act(() => {
      result.current.setSearch('test');
      vi.advanceTimersByTime(300);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.search).toBe('');
    expect(result.current.debouncedSearch).toBe('');
  });

  it('does not fire query when disabled', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactSearch(false), { wrapper });

    act(() => {
      result.current.setSearch('John');
      vi.advanceTimersByTime(300);
    });

    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not fire query for single character', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useContactSearch(), { wrapper });

    act(() => {
      result.current.setSearch('J');
      vi.advanceTimersByTime(300);
    });

    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });
});
