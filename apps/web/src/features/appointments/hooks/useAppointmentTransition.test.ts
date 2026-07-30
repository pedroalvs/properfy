import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

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
import { useAppointmentTransition } from './useAppointmentTransition';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

describe('useAppointmentTransition', () => {
  const wrapper = createQueryWrapper();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: { id: 'appt-1', status: 'DONE' }, error: null });
  });

  it('calls POST with targetStatus, reason, and idempotency key', async () => {
    const { result } = renderHook(
      () => useAppointmentTransition('appt-1'),
      { wrapper },
    );

    act(() => {
      result.current.transition('CANCELLED' as any, 'No longer needed');
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/appointments/appt-1/status-transitions',
        {
          body: { targetStatus: 'CANCELLED', reason: 'No longer needed' },
          headers: { 'Idempotency-Key': expect.any(String) },
        },
      );
    });
  });

  it('sends notifyRentalTenant on a cancellation', async () => {
    const { result } = renderHook(() => useAppointmentTransition('appt-1'), { wrapper });

    act(() => {
      result.current.transition('CANCELLED' as any, 'No longer needed', 'CLIENT_REQUEST', true);
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/appointments/appt-1/status-transitions',
        expect.objectContaining({
          body: expect.objectContaining({
            targetStatus: 'CANCELLED',
            cancellationReasonCode: 'CLIENT_REQUEST',
            notifyRentalTenant: true,
          }),
        }),
      );
    });
  });

  it('omits notifyRentalTenant for a non-cancellation transition', async () => {
    const { result } = renderHook(() => useAppointmentTransition('appt-1'), { wrapper });

    act(() => {
      // A stray `true` on a REJECTED transition must not reach the wire: the
      // backend only consults the flag for CANCELLED, so sending it would
      // misrepresent the request.
      result.current.transition('REJECTED' as any, 'Invalid address', 'INVALID_ADDRESS', true);
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
    });
    const body = mockPost.mock.calls[0]![1].body;
    expect(body).not.toHaveProperty('notifyRentalTenant');
  });

  it('does nothing when appointmentId is null', () => {
    const { result } = renderHook(
      () => useAppointmentTransition(null),
      { wrapper },
    );

    act(() => {
      result.current.transition('DONE' as any);
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('returns isTransitioning based on mutation state', () => {
    const { result } = renderHook(
      () => useAppointmentTransition('appt-1'),
      { wrapper },
    );

    expect(result.current.isTransitioning).toBe(false);
  });

  it('shows success snackbar on successful transition', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () => useAppointmentTransition('appt-1', onSuccess),
      { wrapper },
    );

    act(() => {
      result.current.transition('DONE' as any);
    });

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Transition completed');
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows error snackbar on failed transition', async () => {
    mockPost.mockResolvedValueOnce({ data: null, error: { message: 'Server error' } });

    const { result } = renderHook(
      () => useAppointmentTransition('appt-1'),
      { wrapper },
    );

    act(() => {
      result.current.transition('DONE' as any);
    });

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
  });
});
