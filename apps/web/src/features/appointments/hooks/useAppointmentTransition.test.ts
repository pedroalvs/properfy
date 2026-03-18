import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockMutate = vi.fn();
const mockUseActionMutation = vi.fn(() => ({
  mutate: mockMutate,
  isPending: false,
}));

vi.mock('@/hooks/useApiQuery', () => ({
  useActionMutation: () => mockUseActionMutation(),
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

import { useAppointmentTransition } from './useAppointmentTransition';

describe('useAppointmentTransition', () => {
  const wrapper = createQueryWrapper();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActionMutation.mockReturnValue({ mutate: mockMutate, isPending: false });
  });

  it('calls mutate with targetStatus and reason', () => {
    const { result } = renderHook(
      () => useAppointmentTransition('appt-1'),
      { wrapper },
    );

    act(() => {
      result.current.transition('CANCELLED' as any, 'No longer needed');
    });

    expect(mockMutate).toHaveBeenCalledWith(
      { targetStatus: 'CANCELLED', reason: 'No longer needed' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('does nothing when appointmentId is null', () => {
    const { result } = renderHook(
      () => useAppointmentTransition(null),
      { wrapper },
    );

    act(() => {
      result.current.transition('DONE' as any);
    });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('returns isTransitioning from mutation', () => {
    mockUseActionMutation.mockReturnValue({ mutate: mockMutate, isPending: true });

    const { result } = renderHook(
      () => useAppointmentTransition('appt-1'),
      { wrapper },
    );

    expect(result.current.isTransitioning).toBe(true);
  });

  it('shows success snackbar on successful transition', () => {
    mockMutate.mockImplementation((_data: unknown, opts: any) => opts.onSuccess());

    const onSuccess = vi.fn();
    const { result } = renderHook(
      () => useAppointmentTransition('appt-1', onSuccess),
      { wrapper },
    );

    act(() => {
      result.current.transition('DONE' as any);
    });

    expect(mockShowSuccess).toHaveBeenCalledWith('Transition completed');
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows error snackbar on failed transition', () => {
    mockMutate.mockImplementation((_data: unknown, opts: any) =>
      opts.onError(new Error('Server error')),
    );

    const { result } = renderHook(
      () => useAppointmentTransition('appt-1'),
      { wrapper },
    );

    act(() => {
      result.current.transition('DONE' as any);
    });

    expect(mockShowError).toHaveBeenCalledWith('Server error');
  });
});
