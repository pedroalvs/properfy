import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDayPlan, STOP_IDS } from '../../__fixtures__/day-plan';
import { useReorderPreview } from '../useReorderPreview';
import type { ReorderDraft } from '../useReorderDraft';
import type * as UseApiQueryModule from '@/hooks/useApiQuery';

const mockPost = vi.fn();
vi.mock('@/hooks/useApiQuery', async (importOriginal) => {
  const actual = await importOriginal<typeof UseApiQueryModule>();
  return { ...actual, apiPost: (...args: unknown[]) => mockPost(...args) };
});

const { A, B, C } = STOP_IDS;
const DATE = '2026-11-05';

function previewResponse(order: string[], finishEta: string) {
  return {
    data: {
      etaSource: 'MATRIX',
      approximate: false,
      approximateReason: null,
      departureAt: '2026-11-04T20:50:00.000Z',
      finishEta,
      totals: { driveS: 1800, waitS: 0, serviceS: 8100, lateS: 0, distanceM: null },
      feasible: true,
      violations: [],
      stops: order.map((id, i) => ({
        appointmentId: id,
        sequence: i + 1,
        eta: `2026-11-04T2${i}:00:00.000Z`,
        travelS: 600,
        waitS: 0,
        lateS: 0,
      })),
    },
  };
}

function draft(order: string[]): ReorderDraft {
  return { order, reorderableIds: [A, B, C] } as ReorderDraft;
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => mockPost.mockReset());

describe('useReorderPreview', () => {
  it('previews only the current order (delta 0) when it equals the suggested order', async () => {
    mockPost.mockResolvedValue(previewResponse([A, B, C], '2026-11-04T23:35:00.000Z'));
    const { result } = renderHook(
      () => useReorderPreview(DATE, buildDayPlan(), draft([A, B, C]), { online: true, reorderEnabled: true }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.status).toBe('READY'));
    expect(result.current.deltaMin).toBe(0);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('previews the draft and the suggested baseline to compute a delta', async () => {
    mockPost.mockImplementation((_path: string, body?: { appointmentIds: string[] }) => {
      const ids = body?.appointmentIds ?? [];
      const isSuggested = ids.join(',') === [A, B, C].join(',');
      // suggested finishes 12 min earlier than the manual draft order
      return Promise.resolve(
        previewResponse(ids, isSuggested ? '2026-11-04T23:23:00.000Z' : '2026-11-04T23:35:00.000Z'),
      );
    });
    const { result } = renderHook(
      () => useReorderPreview(DATE, buildDayPlan(), draft([A, C, B]), { online: true, reorderEnabled: true }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.status).toBe('READY'));
    await waitFor(() => expect(result.current.deltaMin).toBe(12));
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('is UNAVAILABLE/OFFLINE and makes no request when offline', () => {
    mockPost.mockResolvedValue(previewResponse([A, B, C], '2026-11-04T23:35:00.000Z'));
    const { result } = renderHook(
      () => useReorderPreview(DATE, buildDayPlan(), draft([A, B, C]), { online: false, reorderEnabled: true }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.status).toBe('UNAVAILABLE');
    expect(result.current.reason).toBe('OFFLINE');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('is IDLE and makes no request when reorder is not enabled', () => {
    mockPost.mockResolvedValue(previewResponse([A, B, C], '2026-11-04T23:35:00.000Z'));
    const { result } = renderHook(
      () => useReorderPreview(DATE, buildDayPlan(), draft([A, B, C]), { online: true, reorderEnabled: false }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.status).toBe('IDLE');
    expect(mockPost).not.toHaveBeenCalled();
  });
});
