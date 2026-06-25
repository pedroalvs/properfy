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

import { api } from '@/services/api';
import { useInvoiceDownload } from './useInvoiceDownload';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { downloadUrl: 'https://example.com/invoice.pdf' } });
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

describe('useInvoiceDownload', () => {
  it('starts with isDownloading false', () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInvoiceDownload(), { wrapper });

    expect(result.current.isDownloading).toBe(false);
  });

  it('calls API and opens download URL', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInvoiceDownload(), { wrapper });

    await act(async () => {
      await result.current.download('inv-01');
    });

    expect(mockGet).toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledWith('https://example.com/invoice.pdf', '_blank');
  });

  it('resets isDownloading after completion', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useInvoiceDownload(), { wrapper });

    await act(async () => {
      await result.current.download('inv-01');
    });

    await waitFor(() => {
      expect(result.current.isDownloading).toBe(false);
    });
  });
});
