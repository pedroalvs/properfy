import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAcceptOffer } from '../useAcceptOffer';
import { ApiError } from '@/lib/api-error';
import { apiPost } from '@/hooks/useApiQuery';

const mockShowError = vi.fn();
const mockShowInfo = vi.fn();
const mockShowSuccess = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  apiPost: vi.fn(),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
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

  it('shows specific message and auto-resets to IDLE after 4s on AVAILABILITY_SLOT_NOT_MATCHED', async () => {
    vi.useFakeTimers();
    vi.mocked(apiPost).mockRejectedValueOnce(
      new ApiError(422, 'No availability slot', 'AVAILABILITY_SLOT_NOT_MATCHED'),
    );

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
    vi.mocked(apiPost).mockRejectedValueOnce(new Error('Network error'));

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

  it('does NOT auto-reset to IDLE when error is CONFLICT (409)', async () => {
    vi.useFakeTimers();
    vi.mocked(apiPost).mockRejectedValueOnce(
      new ApiError(409, 'Already taken', 'OFFER_ALREADY_ACCEPTED'),
    );

    const { result } = renderHook(() => useAcceptOffer());

    await act(async () => {
      await result.current.accept('group-1');
    });

    expect(result.current.getState('group-1')).toBe('CONFLICT');
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.getState('group-1')).toBe('CONFLICT');

    vi.useRealTimers();
  });
});
