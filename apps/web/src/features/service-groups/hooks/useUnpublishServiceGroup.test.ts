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
import { useUnpublishServiceGroup } from './useUnpublishServiceGroup';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPost.mockResolvedValue({ data: { data: {} } });
});

describe('useUnpublishServiceGroup', () => {
  it('returns unpublish function and isUnpublishing state', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUnpublishServiceGroup('sg-01'), { wrapper });

    expect(result.current.unpublish).toBeTypeOf('function');
    expect(result.current.isUnpublishing).toBe(false);
  });

  it('does nothing when serviceGroupId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUnpublishServiceGroup(null), { wrapper });

    act(() => {
      result.current.unpublish('Wrong window');
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('posts the reason to the unpublish endpoint and shows success', async () => {
    const onSuccess = vi.fn();
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUnpublishServiceGroup('sg-01', onSuccess), { wrapper });

    act(() => {
      result.current.unpublish('Wrong time window');
    });

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Service group unpublished');
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/v1/service-groups/sg-01/unpublish',
      expect.objectContaining({ body: { reason: 'Wrong time window' } }),
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows error on failure', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { message: 'Already accepted' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useUnpublishServiceGroup('sg-01'), { wrapper });

    act(() => {
      result.current.unpublish('Wrong time window');
    });

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
  });
});
