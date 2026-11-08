import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ListPropertyFilesResponse } from '@properfy/shared';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess, showError, showInfo: vi.fn() }),
}));

import { api } from '@/services/api';
import { useDeletePropertyFile } from './useDeletePropertyFile';

const mockDelete = api.DELETE as ReturnType<typeof vi.fn>;

function makeClient() {
  const qc = new QueryClient({
    // gcTime Infinity: the manually-seeded cache has no observer, so a 0 gcTime
    // would garbage-collect it the moment the mutation settles (a test artifact).
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  qc.setQueryData<ListPropertyFilesResponse>(['property-files', 'prop-1', null], {
    files: [
      { id: 'f1' } as ListPropertyFilesResponse['files'][number],
      { id: 'f2' } as ListPropertyFilesResponse['files'][number],
    ],
    counts: { total: 2, issues: 0, documents: 2, reports: 0, other: 0 },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

beforeEach(() => {
  mockDelete.mockReset();
  showSuccess.mockReset();
  showError.mockReset();
});

describe('useDeletePropertyFile', () => {
  it('fires the DELETE and optimistically removes the file', async () => {
    mockDelete.mockResolvedValue({ error: undefined, response: { status: 204 } });
    const { qc, wrapper } = makeClient();
    const { result } = renderHook(() => useDeletePropertyFile(), { wrapper });

    await act(async () => {
      result.current.remove('f1');
    });

    await vi.waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('/v1/property-files/{id}', {
        params: { path: { id: 'f1' } },
      }),
    );
    expect(
      (qc.getQueryData(['property-files', 'prop-1', null]) as ListPropertyFilesResponse).files.map((f) => f.id),
    ).toEqual(['f2']);
    expect(showSuccess).toHaveBeenCalled();
  });

  it('rolls back and surfaces an error on failure', async () => {
    mockDelete.mockResolvedValue({
      error: { error: { code: 'INTERNAL_ERROR', message: 'boom' } },
      response: { status: 500 },
    });
    const { qc, wrapper } = makeClient();
    const { result } = renderHook(() => useDeletePropertyFile(), { wrapper });

    await act(async () => {
      result.current.remove('f1');
    });

    await vi.waitFor(() => expect(showError).toHaveBeenCalled());
    expect(
      (qc.getQueryData(['property-files', 'prop-1', null]) as ListPropertyFilesResponse).files.map((f) => f.id),
    ).toEqual(['f1', 'f2']);
  });
});
