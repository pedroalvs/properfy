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
import { useInspectorDetail } from './useInspectorDetail';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_INSPECTOR = {
  id: 'insp-01',
  name: 'Carlos Silva',
  email: 'carlos@inspecoes.com',
  status: 'ACTIVE',
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: MOCK_INSPECTOR });
});

describe('useInspectorDetail', () => {
  it('returns inspector by id', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorDetail('insp-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.inspector).not.toBeNull();
    expect(result.current.inspector?.name).toBe('Carlos Silva');
  });

  it('returns null when id is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorDetail(null), { wrapper });

    expect(result.current.inspector).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state initially', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorDetail('insp-01'), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it('calls API with correct path', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorDetail('insp-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/inspectors/insp-01');
  });

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValueOnce(new Error('Not found'));
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorDetail('insp-01'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.inspector).toBeNull();
  });
});
