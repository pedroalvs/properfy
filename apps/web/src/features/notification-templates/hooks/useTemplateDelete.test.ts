import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

import { api } from '@/services/api';
import { useTemplateDelete } from './useTemplateDelete';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockDelete = api.DELETE as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockDelete.mockReset();
  mockDelete.mockResolvedValue({ data: null });
});

describe('useTemplateDelete', () => {
  it('DELETEs the template by id and returns success', async () => {
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateDelete(), { wrapper });

    let res: { success: boolean } | undefined;
    await act(async () => {
      res = await result.current.deleteTemplate('override-1');
    });

    expect(mockDelete).toHaveBeenCalledWith('/v1/notification-templates/override-1');
    expect(res?.success).toBe(true);
  });

  it('returns failure with the API error message', async () => {
    mockDelete.mockResolvedValueOnce({ error: { error: { message: 'Cannot delete a platform default template' } } });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => useTemplateDelete(), { wrapper });

    let res: { success: boolean; error?: string } | undefined;
    await act(async () => {
      res = await result.current.deleteTemplate('default-1');
    });

    expect(res?.success).toBe(false);
    expect(res?.error).toBe('Cannot delete a platform default template');
  });
});
