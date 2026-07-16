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
import { useSendGroupPortalLinks } from './useSendGroupPortalLinks';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSendGroupPortalLinks', () => {
  it('does nothing when serviceGroupId is null', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSendGroupPortalLinks(null), { wrapper });

    act(() => result.current.send());

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('aggregates the per-item results into a single success toast', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          results: [
            { appointmentId: 'a1', status: 'SENT' },
            { appointmentId: 'a2', status: 'DATE_CHANGED_RESENT' },
            { appointmentId: 'a3', status: 'ALREADY_CONFIRMED' },
            { appointmentId: 'a4', status: 'NOT_SENDABLE' },
            { appointmentId: 'a5', status: 'NO_PRIMARY_CONTACT' },
            { appointmentId: 'a6', status: 'ERROR', error: { code: 'X', message: 'y' } },
          ],
        },
      },
    });

    const onSuccess = vi.fn();
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSendGroupPortalLinks('sg-01', onSuccess), { wrapper });

    act(() => result.current.send());

    await waitFor(() => {
      // 2 sent (SENT + DATE_CHANGED_RESENT), 2 skipped (ALREADY_CONFIRMED + NOT_SENDABLE),
      // 1 no primary contact, 1 failed.
      expect(mockShowSuccess).toHaveBeenCalledWith('2 sent · 2 skipped · 1 no primary contact · 1 failed');
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows error on failure', async () => {
    mockPost.mockResolvedValueOnce({ data: undefined, error: { message: 'Boom' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSendGroupPortalLinks('sg-01'), { wrapper });

    act(() => result.current.send());

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
  });
});
