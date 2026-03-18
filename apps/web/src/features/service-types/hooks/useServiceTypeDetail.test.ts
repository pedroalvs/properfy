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
import { useServiceTypeDetail } from './useServiceTypeDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_SERVICE_TYPE = {
  id: 'st-01', code: 'ROUTINE_IN', name: 'Routine Ingoing', flowType: 'INGOING',
  requiresTenantConfirmation: true, status: 'ACTIVE',
  createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z',
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_SERVICE_TYPE } });
});

describe('useServiceTypeDetail', () => {
  it('returns service type data when id is provided', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceTypeDetail('st-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.serviceType).toEqual(MOCK_SERVICE_TYPE);
  });

  it('does not fetch when id is null', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceTypeDetail(null), { wrapper });

    expect(result.current.serviceType).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns null on error', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Not found' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceTypeDetail('st-99'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
  });
});
