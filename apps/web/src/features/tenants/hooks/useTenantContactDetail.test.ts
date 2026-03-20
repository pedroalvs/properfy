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
import { useTenantContactDetail } from './useTenantContactDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_CONTACT = {
  id: 'tnt-01',
  name: 'Ana Silva',
  email: 'ana.silva@email.com',
  confirmationStatus: 'CONFIRMED',
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_CONTACT } });
});

describe('useTenantContactDetail', () => {
  it('returns contact by id', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantContactDetail('tnt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.contact?.name).toBe('Ana Silva');
  });

  it('returns null when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantContactDetail(null), { wrapper });

    expect(result.current.contact).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantContactDetail('tnt-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.contact).toBeNull();
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantContactDetail('tnt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/appointment-contacts/tnt-01', { params: { query: undefined } });
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Not found' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantContactDetail('tnt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.contact).toBeNull();
  });
});
