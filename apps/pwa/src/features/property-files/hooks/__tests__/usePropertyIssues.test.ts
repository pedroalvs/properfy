import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { PropertyIssueSource } from '@properfy/shared';
import { usePropertyIssues } from '../usePropertyIssues';

const mockApiGet = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({ apiGet: (...args: unknown[]) => mockApiGet(...args) }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

const issueRow = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  propertyId: 'p1',
  appointmentId: 'apt-1',
  reason: 'Broken window',
  source: PropertyIssueSource.STAFF,
  createdByUserId: null,
  cantDoEventId: null,
  seenAt: null,
  seenByUserId: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  photos: [],
  ...over,
});

describe('usePropertyIssues', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists issues by appointmentId, newest-first and memoized', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        issues: [
          issueRow({ id: 'old', createdAt: '2026-11-01T00:00:00.000Z' }),
          issueRow({ id: 'new', createdAt: '2026-11-05T00:00:00.000Z' }),
        ],
      },
    });

    const { result } = renderHook(() => usePropertyIssues('apt-1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiGet).toHaveBeenCalledWith('/v1/property-issues', { appointmentId: 'apt-1' });
    expect(result.current.issues.map((i) => i.id)).toEqual(['new', 'old']);
  });

  it('returns [] before data', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePropertyIssues('apt-1'), { wrapper: wrapper() });
    expect(result.current.issues).toEqual([]);
  });
});
