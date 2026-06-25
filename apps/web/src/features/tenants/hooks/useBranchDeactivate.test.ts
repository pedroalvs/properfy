import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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

const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showInfo: vi.fn(),
  }),
}));

import { api } from '@/services/api';
import { useBranchDeactivate } from './useBranchDeactivate';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
  mockPost.mockResolvedValue({ data: { data: {} } });
});

describe('useBranchDeactivate', () => {
  it('does not call API when tenantId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchDeactivate(null, 'br-01'), { wrapper });

    act(() => {
      result.current.deactivate('Test reason');
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('does not call API when branchId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchDeactivate('ten-01', null), { wrapper });

    act(() => {
      result.current.deactivate('Test reason');
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('calls API when both ids are provided', async () => {
    const onSuccess = vi.fn();
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchDeactivate('ten-01', 'br-01', onSuccess), { wrapper });

    await act(async () => {
      result.current.deactivate('Test reason');
    });

    expect(mockPost).toHaveBeenCalled();
  });

  it('initially isDeactivating is false', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchDeactivate('ten-01', 'br-01'), { wrapper });
    expect(result.current.isDeactivating).toBe(false);
  });
});
