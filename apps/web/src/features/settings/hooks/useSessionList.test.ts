import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

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
import { useSessionList } from './useSessionList';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_SESSIONS = [
  { id: 'sess-01', userAgent: 'Chrome/120', ipAddress: '192.168.1.1', lastActiveAt: '2026-03-17T10:00:00Z', createdAt: '2026-03-16T10:00:00Z', isCurrent: true },
  { id: 'sess-02', userAgent: 'Safari/17', ipAddress: '10.0.0.1', lastActiveAt: '2026-03-16T08:00:00Z', createdAt: '2026-03-15T10:00:00Z', isCurrent: false },
];

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_SESSIONS } });
});

describe('useSessionList', () => {
  it('returns sessions after loading', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSessionList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.sessions).toHaveLength(2);
  });

  it('handles error gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Error' } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSessionList(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
  });
});
