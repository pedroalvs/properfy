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
import { useAssignInspector } from './useAssignInspector';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPost.mockResolvedValue({ data: { data: {} } });
});

describe('useAssignInspector', () => {
  it('returns assign function and isAssigning state', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAssignInspector('sg-01'), { wrapper });

    expect(result.current.assign).toBeTypeOf('function');
    expect(result.current.isAssigning).toBe(false);
  });

  it('does nothing when serviceGroupId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAssignInspector(null), { wrapper });

    act(() => {
      result.current.assign('insp-01');
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('calls API and shows success on assign', async () => {
    const onSuccess = vi.fn();
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAssignInspector('sg-01', onSuccess), { wrapper });

    act(() => {
      result.current.assign('insp-01');
    });

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Inspector assigned');
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows error on failure', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { message: 'Not found' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useAssignInspector('sg-01'), { wrapper });

    act(() => {
      result.current.assign('insp-01');
    });

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
  });
});
