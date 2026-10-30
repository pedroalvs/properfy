import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

import { api } from '@/services/api';
import { useActiveInspectorCount } from './useActiveInspectorCount';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGet.mockReset();
});

describe('useActiveInspectorCount', () => {
  it('reads pagination.total with pageSize=1 when enabled', async () => {
    mockGet.mockResolvedValue({
      data: { data: [{ id: '1' }], pagination: { page: 1, pageSize: 1, total: 42, totalPages: 42 } },
    });
    const { result } = renderHook(() => useActiveInspectorCount(true), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.count).toBe(42));
    expect(mockGet).toHaveBeenCalledWith('/v1/inspectors', {
      params: { query: expect.objectContaining({ status: 'ACTIVE', pageSize: '1' }) },
    });
  });

  it('does not fetch and stays null when disabled', async () => {
    const { result } = renderHook(() => useActiveInspectorCount(false), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.count).toBeNull();
  });

  it('stays null on error (no throw, enables the fallback phrase)', async () => {
    mockGet.mockResolvedValue({ error: { error: { code: 'BOOM', message: 'nope' } }, response: { status: 500 } });
    const { result } = renderHook(() => useActiveInspectorCount(true), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.count).toBeNull();
  });
});
