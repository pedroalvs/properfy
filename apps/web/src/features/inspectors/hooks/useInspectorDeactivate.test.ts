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
import { useInspectorDeactivate } from './useInspectorDeactivate';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
  mockPost.mockResolvedValue({ data: { data: {} } });
});

describe('useInspectorDeactivate', () => {
  it('does not call API when inspectorId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorDeactivate(null), { wrapper });

    act(() => {
      result.current.deactivate('some reason');
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('calls onSuccess and shows a success snackbar on deactivate', async () => {
    const onSuccess = vi.fn();
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorDeactivate('insp-01', onSuccess), { wrapper });

    await act(async () => {
      result.current.deactivate('Poor performance');
    });

    expect(mockPost).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    // SnackbarProvider renders no DOM toast — assert on the mocked show function.
    expect(mockShowSuccess).toHaveBeenCalledWith('Inspector deactivated successfully');
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('shows an error snackbar and does not call onSuccess when the API call fails', async () => {
    mockPost.mockResolvedValueOnce({ error: { message: 'Cannot deactivate' } });
    const onSuccess = vi.fn();
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorDeactivate('insp-01', onSuccess), { wrapper });

    await act(async () => {
      result.current.deactivate('Poor performance');
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockShowSuccess).not.toHaveBeenCalled();
    expect(mockShowError).toHaveBeenCalled();
  });

  it('initially isDeactivating is false', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorDeactivate('insp-01'), { wrapper });
    expect(result.current.isDeactivating).toBe(false);
  });
});
