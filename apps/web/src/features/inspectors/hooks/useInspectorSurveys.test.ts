import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

import { api } from '@/services/api';
import { useInspectorSurveys } from './useInspectorSurveys';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return createElement(QueryClientProvider, { client }, children);
}

/**
 * The response body here is the shape the route ACTUALLY returns, copied from the
 * backend contract rather than invented. Mocking the hook (as the Ratings tab test
 * does) or asserting on a hand-written envelope proves nothing about whether the
 * two halves agree — that mismatch is exactly what shipped a crash here once.
 */
const REAL_API_BODY = {
  data: [
    {
      rating: 5,
      comment: 'Very professional.',
      submittedAt: '2026-08-03T10:00:00.000Z',
      appointmentCode: 'INS-0042',
    },
  ],
  pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
};

beforeEach(() => {
  mockGet.mockReset();
});

describe('useInspectorSurveys', () => {
  it('maps the response the route actually returns', async () => {
    mockGet.mockResolvedValue({ data: REAL_API_BODY });

    const { result } = renderHook(() => useInspectorSurveys('insp-1', 1, true), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.surveys).toHaveLength(1);
    expect(result.current.surveys[0]).toMatchObject({
      rating: 5,
      comment: 'Very professional.',
      appointmentCode: 'INS-0042',
    });
  });

  it('reads the real total so pagination can work', async () => {
    mockGet.mockResolvedValue({ data: REAL_API_BODY });

    const { result } = renderHook(() => useInspectorSurveys('insp-1', 1, true), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // A total stuck at 0 silently hides "Load more" forever.
    expect(result.current.total).toBe(3);
  });

  it('accumulates pages instead of replacing the list', async () => {
    // "Load more" increments the page; without accumulation the visible list is
    // replaced by page 2, which reads as the earlier responses disappearing.
    mockGet.mockResolvedValueOnce({ data: REAL_API_BODY });

    const { result, rerender } = renderHook(({ page }) => useInspectorSurveys('insp-1', page, true), {
      wrapper,
      initialProps: { page: 1 },
    });

    await waitFor(() => expect(result.current.surveys).toHaveLength(1));

    mockGet.mockResolvedValueOnce({
      data: {
        data: [
          {
            rating: 3,
            comment: 'Second page.',
            submittedAt: '2026-08-02T10:00:00.000Z',
            appointmentCode: 'INS-0041',
          },
        ],
        pagination: { page: 2, pageSize: 10, total: 3, totalPages: 1 },
      },
    });

    rerender({ page: 2 });

    await waitFor(() => expect(result.current.surveys).toHaveLength(2));
    expect(result.current.surveys.map((s) => s.appointmentCode)).toEqual(['INS-0042', 'INS-0041']);
  });

  it('issues no request until the tab is opened', async () => {
    renderHook(() => useInspectorSurveys('insp-1', 1, false), { wrapper });

    await waitFor(() => expect(mockGet).not.toHaveBeenCalled());
  });
});
