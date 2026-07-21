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
import { useTenantActivate } from './useTenantActivate';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
  mockPost.mockResolvedValue({ data: { data: {} } });
});

describe('useTenantActivate', () => {
  it('does not call API when tenantId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantActivate(null), { wrapper });

    act(() => {
      result.current.activate();
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('calls API and shows success message on activate', async () => {
    const onSuccess = vi.fn();
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantActivate('ten-01', onSuccess), { wrapper });

    await act(async () => {
      result.current.activate();
    });

    expect(mockPost).toHaveBeenCalled();
    expect(mockShowSuccess).toHaveBeenCalledWith('Agency activated successfully');
    expect(onSuccess).toHaveBeenCalled();
  });

  it('initially isActivating is false', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantActivate('ten-01'), { wrapper });
    expect(result.current.isActivating).toBe(false);
  });

  it('shows error message on API failure', async () => {
    mockPost.mockResolvedValueOnce({ error: { message: 'Activation failed' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTenantActivate('ten-01'), { wrapper });

    await act(async () => {
      result.current.activate();
    });

    expect(mockShowError).toHaveBeenCalled();
  });
});
