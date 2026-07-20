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
import { useCancelServiceGroup } from './useCancelServiceGroup';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPost.mockResolvedValue({ data: { data: {} } });
});

describe('useCancelServiceGroup', () => {
  it('returns cancel function and isCancelling state', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useCancelServiceGroup('sg-01'), { wrapper });

    expect(result.current.cancel).toBeTypeOf('function');
    expect(result.current.isCancelling).toBe(false);
  });

  it('does nothing when serviceGroupId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useCancelServiceGroup(null), { wrapper });

    act(() => {
      result.current.cancel('Some reason');
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('calls API and shows success on cancel', async () => {
    const onSuccess = vi.fn();
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useCancelServiceGroup('sg-01', onSuccess), { wrapper });

    act(() => {
      result.current.cancel('Weather issues');
    });

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Service group cancelled');
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows error on failure', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { message: 'Not found' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useCancelServiceGroup('sg-01'), { wrapper });

    act(() => {
      result.current.cancel('Some reason');
    });

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
  });
});
