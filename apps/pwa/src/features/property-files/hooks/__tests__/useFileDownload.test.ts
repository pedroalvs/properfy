import { renderHook, act, waitFor } from '@testing-library/react';
import { FILE_STORAGE_UNAVAILABLE_MESSAGE } from '@properfy/shared';
import { useFileDownload } from '../useFileDownload';

const mockGet = vi.fn();
vi.mock('@/services/api', () => ({ api: { GET: (...args: unknown[]) => mockGet(...args) } }));

describe('useFileDownload', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  it('fetches the signed URL by file id and opens it in a new tab', async () => {
    mockGet.mockResolvedValue({ data: { data: { url: 'https://signed/x', expiresAt: '2026-11-01T00:05:00Z' } } });
    const { result } = renderHook(() => useFileDownload());

    await act(async () => {
      await result.current.openFile('file-1');
    });

    expect(mockGet).toHaveBeenCalledWith('/v1/property-files/{id}/download', {
      params: { path: { id: 'file-1' } },
    });
    expect(openSpy).toHaveBeenCalledWith('https://signed/x', '_blank', 'noopener,noreferrer');
    expect(result.current.error).toBeNull();
  });

  it('maps a 404 to a not-available message and does not open a tab', async () => {
    mockGet.mockResolvedValue({ error: { error: { code: 'PROPERTY_FILE_NOT_FOUND', message: 'x' } }, response: { status: 404 } });
    const { result } = renderHook(() => useFileDownload());

    await act(async () => {
      await result.current.openFile('file-x');
    });

    await waitFor(() => expect(result.current.error).toMatch(/no longer available/i));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('surfaces the storage-unavailable message on 503', async () => {
    mockGet.mockResolvedValue({ error: { error: { code: 'FILE_STORAGE_UNAVAILABLE', message: 'x' } }, response: { status: 503 } });
    const { result } = renderHook(() => useFileDownload());

    await act(async () => {
      await result.current.openFile('file-x');
    });

    await waitFor(() => expect(result.current.error).toBe(FILE_STORAGE_UNAVAILABLE_MESSAGE));
  });
});
