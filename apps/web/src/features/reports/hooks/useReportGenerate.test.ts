import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockMutate = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({
  useCreateMutation: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  })),
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

import { useReportGenerate } from './useReportGenerate';

describe('useReportGenerate', () => {
  const wrapper = createQueryWrapper();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls mutate with report input', () => {
    const { result } = renderHook(() => useReportGenerate(), { wrapper });

    act(() => {
      result.current.generate({ reportType: 'INSPECTIONS_DONE' });
    });

    expect(mockMutate).toHaveBeenCalledWith(
      { reportType: 'INSPECTIONS_DONE' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('shows success snackbar on success', () => {
    mockMutate.mockImplementation((_data: unknown, opts: any) => opts.onSuccess());

    const { result } = renderHook(() => useReportGenerate(), { wrapper });

    act(() => {
      result.current.generate({ reportType: 'INSPECTIONS_DONE' });
    });

    expect(mockShowSuccess).toHaveBeenCalledWith('Report generation started');
  });

  it('shows error snackbar on failure', () => {
    mockMutate.mockImplementation((_data: unknown, opts: any) =>
      opts.onError(new Error('Generation failed')),
    );

    const { result } = renderHook(() => useReportGenerate(), { wrapper });

    act(() => {
      result.current.generate({ reportType: 'INSPECTIONS_DONE' });
    });

    expect(mockShowError).toHaveBeenCalledWith('Generation failed');
  });
});
