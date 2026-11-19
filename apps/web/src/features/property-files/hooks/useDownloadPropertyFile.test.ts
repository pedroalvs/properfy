import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { FILE_STORAGE_UNAVAILABLE_MESSAGE } from '@properfy/shared';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
const showError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showError, showSuccess: vi.fn(), showInfo: vi.fn() }),
}));

import { api } from '@/services/api';
import { useDownloadPropertyFile } from './useDownloadPropertyFile';

const mockGet = api.GET as ReturnType<typeof vi.fn>;
const openSpy = vi.fn();

beforeEach(() => {
  mockGet.mockReset();
  showError.mockReset();
  openSpy.mockReset();
  vi.stubGlobal('open', openSpy);
});

describe('useDownloadPropertyFile', () => {
  it('opens the signed URL in a new tab', async () => {
    mockGet.mockResolvedValue({
      data: { data: { url: 'https://signed/url', expiresAt: '2026-11-07T00:05:00Z' } },
      error: undefined,
      response: { status: 200 },
    });
    const { result } = renderHook(() => useDownloadPropertyFile());
    let url: string | null = null;
    await act(async () => {
      url = await result.current.download('file-1');
    });
    expect(url).toBe('https://signed/url');
    expect(openSpy).toHaveBeenCalledWith('https://signed/url', '_blank', 'noopener,noreferrer');
    expect(showError).not.toHaveBeenCalled();
  });

  it('shows the shared storage message on 503', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'STORAGE_NOT_CONFIGURED', message: 'nope' } },
      response: { status: 503 },
    });
    const { result } = renderHook(() => useDownloadPropertyFile());
    let url: string | null = 'x';
    await act(async () => {
      url = await result.current.download('file-1');
    });
    expect(url).toBeNull();
    expect(openSpy).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith(FILE_STORAGE_UNAVAILABLE_MESSAGE);
  });
});
