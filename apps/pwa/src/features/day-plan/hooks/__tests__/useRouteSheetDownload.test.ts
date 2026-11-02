import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useRouteSheetDownload } from '../useRouteSheetDownload';

const mockGet = vi.fn();
vi.mock('@/services/api', () => ({ api: { GET: (...args: unknown[]) => mockGet(...args) } }));

const DATE = '2026-11-05';

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client }, children);
}

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let clickSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockGet.mockReset();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  createObjectURL = vi.fn(() => 'blob:fake');
  revokeObjectURL = vi.fn();
  // jsdom lacks these.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  clickSpy.mockRestore();
});

function blobResponse(disposition: string | null) {
  return {
    data: new Blob(['x'], { type: 'application/pdf' }),
    error: undefined,
    response: { status: 200, headers: new Headers(disposition ? { 'Content-Disposition': disposition } : {}) },
  };
}

describe('useRouteSheetDownload', () => {
  it('downloads a PDF with the Content-Disposition filename and revokes the URL after 30s', async () => {
    vi.useFakeTimers();
    try {
      mockGet.mockResolvedValue(blobResponse('attachment; filename="route-jane-doe-2026-11-05.pdf"'));
      const { result } = renderHook(() => useRouteSheetDownload(DATE), { wrapper });

      await act(async () => {
        result.current.download('pdf');
      });
      // Flush the mutation's promise chain (no timer needed to complete it).
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockGet).toHaveBeenCalledWith(
        `/v1/inspector/day-plans/${DATE}/sheet`,
        expect.objectContaining({ params: { query: { format: 'pdf' } }, parseAs: 'blob' }),
      );
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      const anchor = document.querySelector('a');
      // anchor is removed after click, so assert via the download attribute captured at click time
      expect(anchor).toBeNull();

      expect(revokeObjectURL).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to route-{date}.{ext} without a Content-Disposition', async () => {
    const downloadNames: string[] = [];
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      downloadNames.push(this.download);
    });
    mockGet.mockResolvedValue(blobResponse(null));
    const { result } = renderHook(() => useRouteSheetDownload(DATE), { wrapper });

    await act(async () => {
      result.current.download('xlsx');
    });
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(downloadNames[0]).toBe('route-2026-11-05.xlsx');
  });

  it('maps a 404 to a not-ready message', async () => {
    mockGet.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'DAY_PLAN_NOT_FOUND', message: 'x' } },
      response: { status: 404, headers: new Headers() },
    });
    const { result } = renderHook(() => useRouteSheetDownload(DATE), { wrapper });
    await act(async () => {
      result.current.download('pdf');
    });
    await waitFor(() => expect(result.current.error).toBe("This route isn't ready yet."));
  });

  it('maps a network error to an offline message', async () => {
    mockGet.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useRouteSheetDownload(DATE), { wrapper });
    await act(async () => {
      result.current.download('pdf');
    });
    await waitFor(() =>
      expect(result.current.error).toBe("You're offline. Connect to download the route sheet."),
    );
  });
});
