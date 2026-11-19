import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

import { api } from '@/services/api';
import { usePropertyIssues } from './usePropertyIssues';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

beforeEach(() => mockGet.mockReset());

describe('usePropertyIssues', () => {
  it('queries by property scope and unwraps issues', async () => {
    mockGet.mockResolvedValue({
      data: { data: { issues: [{ id: 'i1', reason: 'Leak', photos: [] }] } },
      error: undefined,
      response: { status: 200 },
    });
    const { result } = renderHook(() => usePropertyIssues({ propertyId: 'p-1' }), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.issues).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledWith('/v1/property-issues', {
      params: { query: { propertyId: 'p-1', appointmentId: undefined } },
    });
  });

  it('does not query without a scope id', () => {
    const { result } = renderHook(() => usePropertyIssues({}), { wrapper: createQueryWrapper() });
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.issues).toEqual([]);
  });
});
