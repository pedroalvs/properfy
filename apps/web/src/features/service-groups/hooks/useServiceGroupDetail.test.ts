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
import { useServiceGroupDetail } from './useServiceGroupDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_SERVICE_GROUP = {
  id: 'sg-01',
  name: 'Zona Sul SP',
  regionName: 'São Paulo - Zona Sul',
  status: 'ACTIVE',
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: MOCK_SERVICE_GROUP });
});

describe('useServiceGroupDetail', () => {
  it('returns service group by id', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupDetail('sg-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.serviceGroup).not.toBeNull();
    expect(result.current.serviceGroup?.name).toBe('Zona Sul SP');
  });

  it('returns null when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupDetail(null), { wrapper });

    expect(result.current.serviceGroup).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupDetail('sg-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupDetail('sg-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/service-groups/sg-01');
  });

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValueOnce(new Error('Not found'));
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupDetail('sg-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.serviceGroup).toBeNull();
  });
});
