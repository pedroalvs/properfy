import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAcceptOffer } from '../useAcceptOffer';
import { api } from '@/services/api';

const mockShowError = vi.fn();
const mockShowInfo = vi.fn();
const mockShowSuccess = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  };
});

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showInfo: mockShowInfo,
    dismiss: vi.fn(),
    messages: [],
  }),
}));

const mockPost = api.POST as ReturnType<typeof vi.fn>;

/** openapi-fetch success shape (200 with a JSON body). */
function postSuccess() {
  return { data: { data: {} }, error: undefined, response: { ok: true, status: 200 } };
}

/** openapi-fetch failure shape: error envelope + non-ok Response. */
function postError(status: number, message: string, code?: string) {
  return {
    data: undefined,
    error: { error: { code, message } },
    response: { ok: false, status },
  };
}

describe('useAcceptOffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in IDLE state', () => {
    const { result } = renderHook(() => useAcceptOffer());
    expect(result.current.getState('group-1')).toBe('IDLE');
  });

  it('transitions to CONFIRMING on startConfirm', () => {
    const { result } = renderHook(() => useAcceptOffer());
    act(() => {
      result.current.startConfirm('group-1');
    });
    expect(result.current.getState('group-1')).toBe('CONFIRMING');
  });

  it('transitions back to IDLE on cancelConfirm', () => {
    const { result } = renderHook(() => useAcceptOffer());
    act(() => {
      result.current.startConfirm('group-1');
    });
    act(() => {
      result.current.cancelConfirm('group-1');
    });
    expect(result.current.getState('group-1')).toBe('IDLE');
  });

  it('tracks state per group independently', () => {
    const { result } = renderHook(() => useAcceptOffer());
    act(() => {
      result.current.startConfirm('group-1');
    });
    expect(result.current.getState('group-1')).toBe('CONFIRMING');
    expect(result.current.getState('group-2')).toBe('IDLE');
  });

  it('accepts via the generated contract path with an Idempotency-Key and invalidates both queries (#450)', async () => {
    mockPost.mockResolvedValueOnce(postSuccess());
    const { result } = renderHook(() => useAcceptOffer());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.accept('group-1');
    });

    expect(outcome).toBe('ACCEPTED');
    // Literal contract key + path params, and a non-empty Idempotency-Key.
    expect(mockPost).toHaveBeenCalledWith(
      '/v1/marketplace/offers/{groupId}/accept',
      expect.objectContaining({
        params: { path: { groupId: 'group-1' } },
        headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
      }),
    );
    const headerKey = mockPost.mock.calls[0]?.[1]?.headers?.['Idempotency-Key'];
    expect(headerKey.length).toBeGreaterThan(0);
    // Both caches the accept affects must be invalidated.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['marketplace', 'offers'] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['inspector', 'schedule'] });
    expect(mockShowSuccess).toHaveBeenCalledWith('You accepted the group!');
  });

  it('startConfirm clears a pending post-ERROR reset timer so the sheet is not yanked to IDLE (#453)', async () => {
    vi.useFakeTimers();
    // Drive the group to ERROR, which arms the 4s reset timer.
    mockPost.mockResolvedValueOnce(postError(500, 'Server error'));
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => {
      await result.current.accept('group-1');
    });
    expect(result.current.getState('group-1')).toBe('ERROR');

    // Reopen the confirm sheet within the 4s window.
    act(() => {
      result.current.startConfirm('group-1');
    });
    expect(result.current.getState('group-1')).toBe('CONFIRMING');

    // The stale timer must have been cleared — advancing past 4s keeps CONFIRMING.
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.getState('group-1')).toBe('CONFIRMING');

    vi.useRealTimers();
  });

  it('cancelConfirm clears a pending reset timer without a later spurious transition (#453)', async () => {
    vi.useFakeTimers();
    mockPost.mockResolvedValueOnce(postError(500, 'Server error'));
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => {
      await result.current.accept('group-1');
    });
    expect(result.current.getState('group-1')).toBe('ERROR');

    act(() => {
      result.current.cancelConfirm('group-1');
    });
    expect(result.current.getState('group-1')).toBe('IDLE');

    // A surviving stale timer would still fire setState(IDLE) — harmless value,
    // but it proves the timer leaked. Re-confirm then advance: state must stay.
    act(() => {
      result.current.startConfirm('group-1');
    });
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.getState('group-1')).toBe('CONFIRMING');

    vi.useRealTimers();
  });

  it('shows specific message and auto-resets to IDLE after 4s on AVAILABILITY_SLOT_NOT_MATCHED', async () => {
    vi.useFakeTimers();
    mockPost.mockResolvedValueOnce(postError(422, 'No availability slot', 'AVAILABILITY_SLOT_NOT_MATCHED'));

    const { result } = renderHook(() => useAcceptOffer());

    await act(async () => {
      await result.current.accept('group-1');
    });

    expect(result.current.getState('group-1')).toBe('ERROR');
    expect(mockShowError).toHaveBeenCalledWith(
      'No availability slot for this time window — update your availability in Profile',
    );

    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.getState('group-1')).toBe('IDLE');

    vi.useRealTimers();
  });

  it('shows generic error and auto-resets to IDLE after 4s on unexpected error', async () => {
    vi.useFakeTimers();
    mockPost.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAcceptOffer());

    await act(async () => {
      await result.current.accept('group-1');
    });

    expect(result.current.getState('group-1')).toBe('ERROR');
    expect(mockShowError).toHaveBeenCalledWith('Failed to accept — try again');

    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.getState('group-1')).toBe('IDLE');

    vi.useRealTimers();
  });

  it('surfaces the backend message on unmapped API errors', async () => {
    vi.useFakeTimers();
    mockPost.mockResolvedValueOnce(postError(422, 'Your account is suspended', 'INSPECTOR_SUSPENDED'));

    const { result } = renderHook(() => useAcceptOffer());

    await act(async () => {
      await result.current.accept('group-1');
    });

    expect(result.current.getState('group-1')).toBe('ERROR');
    expect(mockShowError).toHaveBeenCalledWith('Your account is suspended');

    vi.useRealTimers();
  });

  it('resolves with the final state — ACCEPTED on success, ERROR/CONFLICT on failure', async () => {
    mockPost.mockResolvedValueOnce(postSuccess());
    const { result } = renderHook(() => useAcceptOffer());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.accept('group-1');
    });
    expect(outcome).toBe('ACCEPTED');

    mockPost.mockRejectedValueOnce(new Error('Network error'));
    await act(async () => {
      outcome = await result.current.accept('group-2');
    });
    expect(outcome).toBe('ERROR');

    mockPost.mockResolvedValueOnce(postError(409, 'Already taken'));
    await act(async () => {
      outcome = await result.current.accept('group-3');
    });
    expect(outcome).toBe('CONFLICT');
  });

  it('does NOT auto-reset to IDLE when error is CONFLICT (409)', async () => {
    vi.useFakeTimers();
    mockPost.mockResolvedValueOnce(postError(409, 'Already taken', 'OFFER_ALREADY_ACCEPTED'));

    const { result } = renderHook(() => useAcceptOffer());

    await act(async () => {
      await result.current.accept('group-1');
    });

    expect(result.current.getState('group-1')).toBe('CONFLICT');
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.getState('group-1')).toBe('CONFLICT');

    vi.useRealTimers();
  });

  it('cancels the previous reset timer when accept is retried within 4s', async () => {
    vi.useFakeTimers();

    // First call fails → schedules 4s reset timer
    mockPost.mockResolvedValueOnce(postError(500, 'Server error'));
    const { result } = renderHook(() => useAcceptOffer());

    await act(async () => {
      await result.current.accept('group-1');
    });
    expect(result.current.getState('group-1')).toBe('ERROR');

    // Advance 2s (first timer not yet fired)
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.getState('group-1')).toBe('ERROR');

    // Retry within 4s — second call also fails, schedules new 4s timer
    mockPost.mockResolvedValueOnce(postError(500, 'Server error'));
    await act(async () => {
      await result.current.accept('group-1');
    });
    expect(result.current.getState('group-1')).toBe('ERROR');

    // Advance 2s more — original timer would have fired at t=4s but should be cancelled
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.getState('group-1')).toBe('ERROR');

    // Advance the remaining 2s for the new timer → now resets
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.getState('group-1')).toBe('IDLE');

    vi.useRealTimers();
  });

  it('cancels all pending timers on unmount — clearTimeout called for each pending timer', async () => {
    vi.useFakeTimers();
    mockPost.mockResolvedValueOnce(postError(500, 'Server error'));

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const { result, unmount } = renderHook(() => useAcceptOffer());

    await act(async () => {
      await result.current.accept('group-1');
    });
    expect(result.current.getState('group-1')).toBe('ERROR');

    // Unmount with a pending 4s reset timer — expect clearTimeout to be called
    act(() => unmount());
    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });
});
