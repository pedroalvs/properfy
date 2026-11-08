import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ListPropertyIssuesResponse, PropertyIssueUnseenCountResponse } from '@properfy/shared';

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
import { useDeletePropertyIssue } from './useDeletePropertyIssue';

const mockDelete = api.DELETE as ReturnType<typeof vi.fn>;

function makeClient() {
  const qc = new QueryClient({
    // gcTime Infinity: the manually-seeded caches have no observer, so a 0 gcTime
    // would garbage-collect them the moment the mutation settles (a test artifact —
    // the real app keeps an active observer that refetches on invalidation).
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  // A list cache AND the unseen-count cache — both share the ['property-issues'] prefix.
  qc.setQueryData<ListPropertyIssuesResponse>(['property-issues', 'prop-1'], {
    issues: [
      { id: 'i1' } as ListPropertyIssuesResponse['issues'][number],
      { id: 'i2' } as ListPropertyIssuesResponse['issues'][number],
    ],
  });
  qc.setQueryData<PropertyIssueUnseenCountResponse>(['property-issues', 'unseen-count'], {
    appointmentsWithUnseenIssues: 3,
    propertiesWithUnseenIssues: 1,
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

describe('useDeletePropertyIssue', () => {
  it('fires the DELETE and optimistically removes the issue without touching the unseen-count cache', async () => {
    // Regression guard: a prefix-wide optimistic updater used to throw on the
    // unseen-count entry (no `issues` field), aborting the mutation before DELETE.
    mockDelete.mockResolvedValue({ error: undefined, response: { status: 204 } });
    const { qc, wrapper } = makeClient();
    const { result } = renderHook(() => useDeletePropertyIssue(), { wrapper });

    await act(async () => {
      result.current.remove('i1');
    });

    await vi.waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('/v1/property-issues/{id}', {
        params: { path: { id: 'i1' } },
      }),
    );
    expect(
      (qc.getQueryData(['property-issues', 'prop-1']) as ListPropertyIssuesResponse).issues.map((i) => i.id),
    ).toEqual(['i2']);
    // unseen-count entry is untouched and intact (never crashed the updater).
    expect(qc.getQueryData(['property-issues', 'unseen-count'])).toEqual({
      appointmentsWithUnseenIssues: 3,
      propertiesWithUnseenIssues: 1,
    });
    expect(showSuccess).toHaveBeenCalled();
  });

  it('rolls the list back and surfaces an error when the DELETE fails', async () => {
    mockDelete.mockResolvedValue({
      error: { error: { code: 'INTERNAL_ERROR', message: 'boom' } },
      response: { status: 500 },
    });
    const { qc, wrapper } = makeClient();
    const { result } = renderHook(() => useDeletePropertyIssue(), { wrapper });

    await act(async () => {
      result.current.remove('i1');
    });

    await vi.waitFor(() => expect(showError).toHaveBeenCalled());
    // Rolled back to the original two issues.
    expect(
      (qc.getQueryData(['property-issues', 'prop-1']) as ListPropertyIssuesResponse).issues.map((i) => i.id),
    ).toEqual(['i1', 'i2']);
  });
});
