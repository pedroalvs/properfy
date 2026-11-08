import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { PropertyFileType } from '@properfy/shared';
import { usePropertyFiles } from '../usePropertyFiles';

const mockApiGet = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({ apiGet: (...args: unknown[]) => mockApiGet(...args) }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

const fileRow = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  propertyId: 'p1',
  appointmentId: 'apt-1',
  issueId: null,
  type: PropertyFileType.DOCUMENT,
  versionGroupId: 'vg1',
  version: 1,
  fileName: 'lease.pdf',
  mime: 'application/pdf',
  sizeBytes: 10,
  status: 'READY',
  uploadedByUserId: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  ...over,
});

describe('usePropertyFiles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists files by appointmentId and exposes grouped, memoized data', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        files: [
          fileRow({ id: 'd1', type: PropertyFileType.DOCUMENT }),
          fileRow({ id: 'r1', type: PropertyFileType.REPORT }),
          fileRow({ id: 'i1', type: PropertyFileType.ISSUE, mime: 'image/jpeg' }),
        ],
        counts: { total: 3, issues: 1, documents: 1, reports: 1, other: 0 },
      },
    });

    const { result } = renderHook(() => usePropertyFiles('apt-1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApiGet).toHaveBeenCalledWith('/v1/property-files', { appointmentId: 'apt-1' });
    expect(result.current.grouped.documents.map((f) => f.id)).toEqual(['d1']);
    expect(result.current.grouped.reports.map((f) => f.id)).toEqual(['r1']);
    // ISSUE files are not in the flat lists.
    expect(result.current.grouped.other).toEqual([]);
  });

  it('returns empty groups before data and never throws on a missing payload', () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // pending
    const { result } = renderHook(() => usePropertyFiles('apt-1'), { wrapper: wrapper() });
    expect(result.current.grouped).toEqual({ documents: [], reports: [], other: [] });
  });
});
