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

  const SAMPLE_INPUT = {
    reportType: 'APPOINTMENTS',
    filters: {
      fromDate: '2026-03-01',
      toDate: '2026-03-31',
      dateAxis: 'SCHEDULED',
      groupProperties: false,
    },
  } as const;

  it('calls mutate with the full report input shape', () => {
    const { result } = renderHook(() => useReportGenerate(), { wrapper });

    act(() => {
      result.current.generate(SAMPLE_INPUT);
    });

    expect(mockMutate).toHaveBeenCalledWith(
      SAMPLE_INPUT,
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('shows success snackbar and runs the caller onSuccess on success', () => {
    mockMutate.mockImplementation((_data: unknown, opts: any) => opts.onSuccess());
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useReportGenerate(), { wrapper });

    act(() => {
      result.current.generate(SAMPLE_INPUT, { onSuccess });
    });

    expect(mockShowSuccess).toHaveBeenCalledWith('Report generation started');
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows error snackbar on failure', () => {
    mockMutate.mockImplementation((_data: unknown, opts: any) =>
      opts.onError(new Error('Generation failed')),
    );

    const { result } = renderHook(() => useReportGenerate(), { wrapper });

    act(() => {
      result.current.generate(SAMPLE_INPUT);
    });

    expect(mockShowError).toHaveBeenCalledWith('Generation failed');
  });
});
