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
import { useBranchActivate } from './useBranchActivate';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
  mockPost.mockResolvedValue({ data: { data: {} } });
});

describe('useBranchActivate', () => {
  it('does not call API when tenantId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchActivate(null, 'br-01'), { wrapper });

    act(() => {
      result.current.activate();
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('does not call API when branchId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchActivate('ten-01', null), { wrapper });

    act(() => {
      result.current.activate();
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('posts to the branch activate endpoint with an empty body', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchActivate('ten-01', 'br-02'), { wrapper });

    await act(async () => {
      result.current.activate();
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/v1/tenants/ten-01/branches/br-02/activate',
      { body: {} },
    );
  });

  it('shows success message and calls onSuccess on activate', async () => {
    const onSuccess = vi.fn();
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => useBranchActivate('ten-01', 'br-02', onSuccess),
      { wrapper },
    );

    await act(async () => {
      result.current.activate();
    });

    expect(mockShowSuccess).toHaveBeenCalledWith('Branch activated successfully');
    expect(onSuccess).toHaveBeenCalled();
  });

  it('initially isActivating is false', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchActivate('ten-01', 'br-02'), { wrapper });
    expect(result.current.isActivating).toBe(false);
  });

  it('shows error message on API failure', async () => {
    mockPost.mockResolvedValueOnce({ error: { message: 'Activation failed' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useBranchActivate('ten-01', 'br-02'), { wrapper });

    await act(async () => {
      result.current.activate();
    });

    expect(mockShowError).toHaveBeenCalled();
  });
});
