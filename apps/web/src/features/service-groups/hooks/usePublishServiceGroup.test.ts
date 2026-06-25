import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

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
import { usePublishServiceGroup } from './usePublishServiceGroup';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPost.mockResolvedValue({ data: { data: {} } });
});

describe('usePublishServiceGroup', () => {
  it('returns publish function and isPublishing state', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePublishServiceGroup('sg-01'), { wrapper });

    expect(result.current.publish).toBeTypeOf('function');
    expect(result.current.isPublishing).toBe(false);
  });

  it('does nothing when serviceGroupId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePublishServiceGroup(null), { wrapper });

    act(() => {
      result.current.publish();
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('calls API and shows success on publish', async () => {
    const onSuccess = vi.fn();
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePublishServiceGroup('sg-01', onSuccess), { wrapper });

    act(() => {
      result.current.publish();
    });

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Service group published');
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows error on failure', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { message: 'Not found' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => usePublishServiceGroup('sg-01'), { wrapper });

    act(() => {
      result.current.publish();
    });

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
  });
});
