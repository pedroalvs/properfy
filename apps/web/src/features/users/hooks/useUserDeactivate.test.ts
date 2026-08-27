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
import { useUserDeactivate } from './useUserDeactivate';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
  mockPost.mockResolvedValue({ data: { data: {} } });
});

describe('useUserDeactivate', () => {
  it('does not call API when userId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useUserDeactivate(null, 'ten-01', 'tenant'),
      { wrapper },
    );

    act(() => {
      result.current.deactivate('some reason');
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('does not call API in tenant scope when tenantId is missing', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useUserDeactivate('user-01', undefined, 'tenant'),
      { wrapper },
    );

    act(() => {
      result.current.deactivate('some reason');
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('does not post when the reason is only whitespace', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useUserDeactivate('user-01', 'ten-01', 'tenant'),
      { wrapper },
    );

    act(() => {
      result.current.deactivate('   ');
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('trims the reason before posting', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useUserDeactivate('user-01', 'ten-01', 'tenant'),
      { wrapper },
    );

    await act(async () => {
      result.current.deactivate('  Employee left  ');
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/v1/tenants/ten-01/users/user-01/deactivate',
      { body: { reason: 'Employee left' } },
    );
  });

  it('posts the reason to the tenant-scoped route', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useUserDeactivate('user-01', 'ten-01', 'tenant'),
      { wrapper },
    );

    await act(async () => {
      result.current.deactivate('Employee left');
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/v1/tenants/ten-01/users/user-01/deactivate',
      { body: { reason: 'Employee left' } },
    );
  });

  it('posts the reason to the internal route', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useUserDeactivate('user-01', undefined, 'internal'),
      { wrapper },
    );

    await act(async () => {
      result.current.deactivate('No longer with the platform');
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/v1/users/user-01/deactivate',
      { body: { reason: 'No longer with the platform' } },
    );
  });

  it('initially isDeactivating is false', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useUserDeactivate('user-01', 'ten-01', 'tenant'),
      { wrapper },
    );
    expect(result.current.isDeactivating).toBe(false);
  });
});
