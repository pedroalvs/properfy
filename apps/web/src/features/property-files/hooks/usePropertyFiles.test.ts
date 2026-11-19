import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

import { api } from '@/services/api';
import { usePropertyFiles } from './usePropertyFiles';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

beforeEach(() => mockGet.mockReset());

describe('usePropertyFiles', () => {
  it('queries by appointment scope and unwraps files + counts', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          files: [{ id: 'f1', type: 'DOCUMENT' }],
          counts: { total: 1, issues: 0, documents: 1, reports: 0, other: 0 },
        },
      },
      error: undefined,
      response: { status: 200 },
    });
    const { result } = renderHook(
      () => usePropertyFiles({ appointmentId: 'apt-1', type: undefined }),
      { wrapper: createQueryWrapper() },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.files).toHaveLength(1);
    expect(result.current.counts.documents).toBe(1);
    expect(mockGet).toHaveBeenCalledWith('/v1/property-files', {
      params: { query: { propertyId: undefined, appointmentId: 'apt-1', type: undefined } },
    });
  });

  it('does not query without a scope id', () => {
    const { result } = renderHook(() => usePropertyFiles({}), { wrapper: createQueryWrapper() });
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.files).toEqual([]);
    expect(result.current.counts.total).toBe(0);
  });

  it('exposes empty counts and error state on failure', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'INTERNAL_ERROR', message: 'boom' } },
      response: { status: 500 },
    });
    const { result } = renderHook(() => usePropertyFiles({ propertyId: 'p-1' }), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.files).toEqual([]);
    expect(result.current.counts.total).toBe(0);
  });
});
