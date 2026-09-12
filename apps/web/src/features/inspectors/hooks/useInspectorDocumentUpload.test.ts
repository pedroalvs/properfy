import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import { useInspectorDocumentUpload } from './useInspectorDocumentUpload';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

function makeFile(): File {
  return new File(['content'], 'insurance.pdf', { type: 'application/pdf' });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockPost.mockReset();
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
  mockPost.mockResolvedValue({
    data: { data: { uploadUrl: 'https://storage.example/upload', storageKey: 'uploads/x', expiresAt: '2099-01-01' } },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useInspectorDocumentUpload', () => {
  it('aborts the presigned PUT after the upload timeout and resets isUploading', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorDocumentUpload(), { wrapper });

    let uploadPromise!: Promise<boolean>;
    act(() => {
      uploadPromise = result.current.upload('insp-01', 'INSURANCE', makeFile());
    });

    // Flush the presign call's microtasks so the PUT fetch (and its timeout
    // timer) is actually scheduled before we fast-forward.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isUploading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const success = await uploadPromise;

    expect(success).toBe(false);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.uploadError).toBe('Upload timed out');
    expect(mockShowError).toHaveBeenCalledWith('Upload timed out');
  });

  it('completes the presign → PUT → confirm flow, clears the timer and resets isUploading', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true } as Response);
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInspectorDocumentUpload(), { wrapper });

    let success!: boolean;
    await act(async () => {
      success = await result.current.upload('insp-01', 'INSURANCE', makeFile());
    });

    expect(success).toBe(true);
    // presign + confirm
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledOnce();
    // The timeout timer is cleared on the success path (no leak).
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(result.current.isUploading).toBe(false);
    expect(result.current.uploadError).toBeNull();
    expect(mockShowSuccess).toHaveBeenCalled();
  });
});
