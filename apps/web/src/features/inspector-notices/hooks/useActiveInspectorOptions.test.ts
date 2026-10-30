import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

import { api } from '@/services/api';
import { useActiveInspectorOptions } from './useActiveInspectorOptions';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
});

describe('useActiveInspectorOptions', () => {
  it('maps and sorts ACTIVE inspectors by name', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          { id: '2', name: 'Zoe', email: 'z@x.io' },
          { id: '1', name: 'Ana', email: 'a@x.io' },
        ],
        pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
      },
    });
    const { result } = renderHook(() => useActiveInspectorOptions(true), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.options).toEqual([
      { id: '1', name: 'Ana', email: 'a@x.io' },
      { id: '2', name: 'Zoe', email: 'z@x.io' },
    ]);
    expect(mockGet).toHaveBeenCalledWith('/v1/inspectors', {
      params: { query: expect.objectContaining({ status: 'ACTIVE', pageSize: '100' }) },
    });
  });

  it('does not fetch when disabled', async () => {
    const { result } = renderHook(() => useActiveInspectorOptions(false), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.options).toEqual([]);
  });

  it('surfaces a load error', async () => {
    mockGet.mockResolvedValue({ error: { error: { code: 'BOOM', message: 'nope' } }, response: { status: 500 } });
    const { result } = renderHook(() => useActiveInspectorOptions(true), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.options).toEqual([]);
  });
});
