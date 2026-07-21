import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { api } from '@/services/api';
import { useSessionRevoke } from './useSessionRevoke';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockDelete = api.DELETE as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockDelete.mockReset();
  mockDelete.mockResolvedValue({ data: { success: true } });
});

describe('useSessionRevoke', () => {
  it('returns success on revoke', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSessionRevoke(), { wrapper });

    let res: { success: boolean } | undefined;
    await act(async () => {
      res = await result.current.revoke('sess-02');
    });

    expect(res?.success).toBe(true);
    expect(mockDelete).toHaveBeenCalled();
  });

  it('returns failure on API error', async () => {
    mockDelete.mockResolvedValueOnce({ data: undefined, error: { error: { message: 'Not found' } } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useSessionRevoke(), { wrapper });

    let res: { success: boolean; error?: string } | undefined;
    await act(async () => {
      res = await result.current.revoke('sess-99');
    });

    expect(res?.success).toBe(false);
    expect(res?.error).toBe('Not found');
  });
});
