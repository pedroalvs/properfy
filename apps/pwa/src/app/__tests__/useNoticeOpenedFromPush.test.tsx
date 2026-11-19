import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNoticeOpenedFromPush } from '../useNoticeOpenedFromPush';

const apiPostMock = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({ apiPost: (...a: unknown[]) => apiPostMock(...a) }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return { ...actual, useNavigate: () => navigateMock };
});

const UUID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';

function wrapper(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[entry]} future={{ v7_relativeSplatPath: true }}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('useNoticeOpenedFromPush', () => {
  beforeEach(() => {
    apiPostMock.mockReset();
    apiPostMock.mockResolvedValue(undefined);
    navigateMock.mockReset();
  });

  it('marks the notice read and strips the param for a valid fromNotice', async () => {
    renderHook(() => useNoticeOpenedFromPush(), {
      wrapper: wrapper(`/schedule/${UUID}?fromNotice=${UUID}`),
    });
    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(`/v1/inspectors/me/notices/${UUID}/read`),
    );
    expect(navigateMock).toHaveBeenCalledWith(`/schedule/${UUID}`, { replace: true });
  });

  it('ignores and removes a non-UUID fromNotice', async () => {
    renderHook(() => useNoticeOpenedFromPush(), {
      wrapper: wrapper('/schedule/abc?fromNotice=not-a-uuid'),
    });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/schedule/abc', { replace: true }));
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('does nothing without a fromNotice param', async () => {
    renderHook(() => useNoticeOpenedFromPush(), { wrapper: wrapper(`/schedule/${UUID}`) });
    await new Promise((r) => setTimeout(r, 10));
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('stays silent when the read POST 404s', async () => {
    apiPostMock.mockRejectedValue(new Error('404'));
    renderHook(() => useNoticeOpenedFromPush(), {
      wrapper: wrapper(`/schedule/${UUID}?fromNotice=${UUID}`),
    });
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
  });
});
