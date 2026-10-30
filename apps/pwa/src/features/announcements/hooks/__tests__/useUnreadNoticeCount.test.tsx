import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUnreadNoticeCount, UNREAD_COUNT_KEY } from '../useUnreadNoticeCount';

const getMock = vi.fn();
vi.mock('@/services/api', () => ({
  api: { GET: (...args: unknown[]) => getMock(...args) },
}));

class FakeServiceWorkerContainer extends EventTarget {}

function setServiceWorker(sw: EventTarget | undefined) {
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useUnreadNoticeCount', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockResolvedValue({ data: { data: { count: 3 } } });
  });
  afterEach(() => {
    setServiceWorker(undefined);
  });

  it('queries /unread-count under the canonical key with focus refetch and exposes count', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUnreadNoticeCount(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.count).toBe(3));
    expect(getMock).toHaveBeenCalledWith('/v1/inspectors/me/notices/unread-count', {
      params: { query: undefined },
    });

    const observers = client.getQueryCache().find({ queryKey: UNREAD_COUNT_KEY as unknown as unknown[] });
    expect(observers?.options.refetchOnWindowFocus).toBe(true);
    expect(observers?.options.staleTime).toBe(30_000);
  });

  it('invalidates the inspector-notices tree on a service-worker push message', async () => {
    const sw = new FakeServiceWorkerContainer();
    setServiceWorker(sw);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useUnreadNoticeCount(), { wrapper: wrapper(client) });
    await waitFor(() => expect(getMock).toHaveBeenCalled());

    sw.dispatchEvent(new MessageEvent('message', { data: { type: 'inspector-notice:received' } }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inspector-notices'] });
  });

  it('ignores unrelated service-worker messages', async () => {
    const sw = new FakeServiceWorkerContainer();
    setServiceWorker(sw);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useUnreadNoticeCount(), { wrapper: wrapper(client) });
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    invalidate.mockClear();

    sw.dispatchEvent(new MessageEvent('message', { data: { type: 'navigate', url: '/x' } }));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
