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
import { useServiceGroupDetail } from './useServiceGroupDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_SERVICE_GROUP = {
  id: 'sg-01',
  regionName: 'São Paulo - Zona Sul',
  status: 'ACTIVE',
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_SERVICE_GROUP } });
});

describe('useServiceGroupDetail', () => {
  it('returns service group by id', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupDetail('sg-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.serviceGroup).not.toBeNull();
    expect(result.current.serviceGroup?.id).toBe('sg-01');
  });

  it('maps serviceRegionId to null when absent from the raw response', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupDetail('sg-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.serviceGroup?.serviceRegionId).toBeNull();
  });

  it('maps serviceRegionId from the raw response when present', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: { ...MOCK_SERVICE_GROUP, serviceRegionId: 'region-99' } },
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupDetail('sg-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.serviceGroup?.serviceRegionId).toBe('region-99');
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

    expect(mockGet).toHaveBeenCalledWith('/v1/service-groups/sg-01', { params: { query: undefined } });
  });

  it('handles API error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Not found' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useServiceGroupDetail('sg-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.serviceGroup).toBeNull();
  });
});
