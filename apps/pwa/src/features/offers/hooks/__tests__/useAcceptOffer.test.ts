import { renderHook, act } from '@testing-library/react';
import { useAcceptOffer } from '../useAcceptOffer';

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
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    dismiss: vi.fn(),
    messages: [],
  }),
}));

describe('useAcceptOffer', () => {
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
});
