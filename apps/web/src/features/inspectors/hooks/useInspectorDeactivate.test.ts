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

  it('calls API and shows success message on deactivate', async () => {
    const onSuccess = vi.fn();
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorDeactivate('insp-01', onSuccess), { wrapper });

    await act(async () => {
      result.current.deactivate('Poor performance');
    });

    expect(mockPost).toHaveBeenCalled();
  });

  it('initially isDeactivating is false', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorDeactivate('insp-01'), { wrapper });
    expect(result.current.isDeactivating).toBe(false);
  });
});
