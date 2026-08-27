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
import { useUserReactivate } from './useUserReactivate';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
  mockPost.mockResolvedValue({ data: { data: {} } });
});

describe('useUserReactivate', () => {
  it('does not call API when userId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useUserReactivate(null, 'ten-01', 'tenant'),
      { wrapper },
    );

    act(() => {
      result.current.reactivate();
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('posts to the tenant-scoped reactivate route', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useUserReactivate('user-01', 'ten-01', 'tenant'),
      { wrapper },
    );

    await act(async () => {
      result.current.reactivate();
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/v1/tenants/ten-01/users/user-01/reactivate',
      { body: {} },
    );
  });

  it('posts to the internal reactivate route', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useUserReactivate('user-01', undefined, 'internal'),
      { wrapper },
    );

    await act(async () => {
      result.current.reactivate();
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/v1/users/user-01/reactivate',
      { body: {} },
    );
  });

  it('initially isReactivating is false', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useUserReactivate('user-01', 'ten-01', 'tenant'),
      { wrapper },
    );
    expect(result.current.isReactivating).toBe(false);
  });
});
