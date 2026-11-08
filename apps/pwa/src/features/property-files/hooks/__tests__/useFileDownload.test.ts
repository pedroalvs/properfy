import { renderHook, act, waitFor } from '@testing-library/react';
import { FILE_STORAGE_UNAVAILABLE_MESSAGE } from '@properfy/shared';
import { useFileDownload } from '../useFileDownload';

const mockGet = vi.fn();
vi.mock('@/services/api', () => ({ api: { GET: (...args: unknown[]) => mockGet(...args) } }));

interface FakeWin {
  closed: boolean;
  opener: unknown;
  location: { href: string };
  close: ReturnType<typeof vi.fn>;
}

function fakeWin(): FakeWin {
  return { closed: false, opener: {}, location: { href: '' }, close: vi.fn() };
}

describe('useFileDownload', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pre-opens a tab synchronously then points it at the signed URL (iOS-safe)', async () => {
    const win = fakeWin();
    openSpy = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    mockGet.mockResolvedValue({ data: { data: { url: 'https://signed/x', expiresAt: '2026-11-01T00:05:00Z' } } });
    const { result } = renderHook(() => useFileDownload());

    await act(async () => {
      await result.current.openFile('file-1');
    });

    // Opened synchronously with an empty URL (within the user gesture), not with the resolved URL.
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(win.opener).toBeNull();
    expect(win.location.href).toBe('https://signed/x');
    expect(mockGet).toHaveBeenCalledWith('/v1/property-files/{id}/download', {
      params: { path: { id: 'file-1' } },
    });
    expect(result.current.error).toBeNull();
  });

  it('closes the pre-opened tab and shows a not-available message on 404', async () => {
    const win = fakeWin();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    mockGet.mockResolvedValue({ error: { error: { code: 'PROPERTY_FILE_NOT_FOUND', message: 'x' } }, response: { status: 404 } });
    const { result } = renderHook(() => useFileDownload());

    await act(async () => {
      await result.current.openFile('file-x');
    });

    await waitFor(() => expect(result.current.error).toMatch(/no longer available/i));
    expect(win.close).toHaveBeenCalled();
    expect(win.location.href).toBe(''); // never navigated
  });

  it('surfaces the storage-unavailable message on 503', async () => {
    const win = fakeWin();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    mockGet.mockResolvedValue({ error: { error: { code: 'FILE_STORAGE_UNAVAILABLE', message: 'x' } }, response: { status: 503 } });
    const { result } = renderHook(() => useFileDownload());

    await act(async () => {
      await result.current.openFile('file-x');
    });

    await waitFor(() => expect(result.current.error).toBe(FILE_STORAGE_UNAVAILABLE_MESSAGE));
    expect(win.close).toHaveBeenCalled();
  });
});
