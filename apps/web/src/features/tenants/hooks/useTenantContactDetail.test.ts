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

import { apiClient } from '@/lib/api-client';
import { useTenantContactDetail } from './useTenantContactDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_CONTACT = {
  id: 'tnt-01',
  name: 'Ana Silva',
  email: 'ana.silva@email.com',
  confirmationStatus: 'CONFIRMED',
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: MOCK_CONTACT });
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

    expect(mockGet).toHaveBeenCalledWith('/v1/tenants/tnt-01');
  });

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValueOnce(new Error('Not found'));
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantContactDetail('tnt-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.contact).toBeNull();
  });
});
