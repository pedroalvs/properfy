import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useInspectorAlertThresholds } from './useInspectorAlertThresholds';

const getMock = vi.fn();
const putMock = vi.fn();
vi.mock('@/services/api', () => ({
  api: {
    GET: (...args: unknown[]) => getMock(...args),
    PUT: (...args: unknown[]) => putMock(...args),
  },
}));

function responseBody() {
  return {
    data: {
      data: {
        inspectorId: 'insp-1',
        platformDefaults: { delayMinutes: 20, notStartedMinutes: 30 },
        override: { delayMinutes: null, notStartedMinutes: null },
        effective: { delayMinutes: 20, notStartedMinutes: 30 },
      },
    },
    error: undefined,
    response: { status: 200 },
  };
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { Wrapper, invalidateSpy };
}

beforeEach(() => {
  getMock.mockReset();
  putMock.mockReset();
  getMock.mockResolvedValue(responseBody());
  putMock.mockResolvedValue(responseBody());
});

describe('useInspectorAlertThresholds', () => {
  it('fetches the thresholds for the inspector', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useInspectorAlertThresholds('insp-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(getMock).toHaveBeenCalledWith('/v1/inspectors/{inspectorId}/alert-thresholds', {
      params: { path: { inspectorId: 'insp-1' } },
    });
    expect(result.current.data?.effective.delayMinutes).toBe(20);
  });

  it('does not fetch when disabled (CL roles)', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useInspectorAlertThresholds('insp-1', { enabled: false }), { wrapper: Wrapper });
    // Give any effect a tick; the query must never fire.
    await new Promise((r) => setTimeout(r, 10));
    expect(getMock).not.toHaveBeenCalled();
  });

  it('does not fetch when the inspectorId is null', async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useInspectorAlertThresholds(null), { wrapper: Wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(getMock).not.toHaveBeenCalled();
  });

  it('saves the override and invalidates its own query and the live-day query', async () => {
    const { Wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useInspectorAlertThresholds('insp-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    await act(async () => {
      await result.current.save({ delayMinutes: 15, notStartedMinutes: null });
    });

    expect(putMock).toHaveBeenCalledWith('/v1/inspectors/{inspectorId}/alert-thresholds', {
      params: { path: { inspectorId: 'insp-1' } },
      body: { delayMinutes: 15, notStartedMinutes: null },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inspector-alert-thresholds', 'insp-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['live-day'] });
  });
});
