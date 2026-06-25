import { act, renderHook, waitFor } from '@testing-library/react';
import { useAssetUpload } from '../useAssetUpload';
import type { PendingAssetRecord } from '../../lib/indexeddb';

const mockApiPost = vi.fn();
const mockSavePendingAsset = vi.fn();
const mockGetPendingAssets = vi.fn();
const mockRemovePendingAsset = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

vi.mock('../../lib/indexeddb', () => ({
  savePendingAsset: (...args: unknown[]) => mockSavePendingAsset(...args),
  getPendingAssets: (...args: unknown[]) => mockGetPendingAssets(...args),
  removePendingAsset: (...args: unknown[]) => mockRemovePendingAsset(...args),
}));

describe('useAssetUpload', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalXMLHttpRequest = globalThis.XMLHttpRequest;
  const originalRandomUUID = crypto.randomUUID;

  beforeEach(() => {
    mockApiPost.mockReset();
    mockSavePendingAsset.mockReset();
    mockGetPendingAssets.mockReset();
    mockRemovePendingAsset.mockReset();
    mockGetPendingAssets.mockResolvedValue([]);

    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    crypto.randomUUID = vi.fn(() => 'local-asset-1');

    class MockXHR {
      status = 200;
      upload = { onprogress: null as ((event: ProgressEvent<EventTarget>) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      send() {
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: 1,
          total: 1,
        } as ProgressEvent<EventTarget>);
        this.onload?.();
      }
    }

    globalThis.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    crypto.randomUUID = originalRandomUUID;
    globalThis.XMLHttpRequest = originalXMLHttpRequest;
  });

  it('rehydrates only assets from the current appointment and marks interrupted uploads as error', async () => {
    const pendingAssets: PendingAssetRecord[] = [
      {
        appointmentId: 'apt-1',
        localId: 'asset-1',
        assetId: null,
        filename: 'kitchen.jpg',
        contentType: 'image/jpeg',
        blobUrl: '',
        status: 'uploading',
        progress: 65,
        uploadUrl: null,
        storageKey: null,
        blob: new Blob(['img'], { type: 'image/jpeg' }),
      },
      {
        appointmentId: 'apt-2',
        localId: 'asset-2',
        assetId: null,
        filename: 'other.jpg',
        contentType: 'image/jpeg',
        blobUrl: '',
        status: 'pending',
        progress: 0,
        uploadUrl: null,
        storageKey: null,
        blob: new Blob(['img'], { type: 'image/jpeg' }),
      },
    ];
    mockGetPendingAssets.mockResolvedValueOnce(pendingAssets);
    (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce('blob:asset-1');

    const { result } = renderHook(() => useAssetUpload('apt-1'));

    await waitFor(() => expect(result.current.assets).toHaveLength(1));
    expect(result.current.assets[0]).toMatchObject({
      localId: 'asset-1',
      filename: 'kitchen.jpg',
      status: 'error',
      blobUrl: 'blob:asset-1',
    });
  });

  it('persists pending asset immediately and removes it only after confirmed upload', async () => {
    mockApiPost
      .mockResolvedValueOnce({
        data: {
          assetId: 'server-asset-1',
          uploadUrl: 'https://upload.example.com/1',
          storageKey: 'inspections/1.jpg',
          expiresAt: '2026-03-25T12:00:00Z',
        },
      })
      .mockResolvedValueOnce({ data: { ok: true } });

    const { result } = renderHook(() => useAssetUpload('apt-1'));
    const file = new File(['photo'], 'room.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.addAsset(file);
    });

    expect(mockSavePendingAsset).toHaveBeenCalled();
    expect(mockRemovePendingAsset).toHaveBeenCalledWith('local-asset-1');
    await waitFor(() =>
      expect(result.current.completedAssets).toEqual([
        { assetId: 'server-asset-1', storageKey: 'inspections/1.jpg' },
      ]),
    );
  });

  it('retries failed assets using the persisted blob instead of deleting them', async () => {
    const persistedBlob = new Blob(['img'], { type: 'image/jpeg' });
    mockGetPendingAssets
      .mockResolvedValueOnce([
        {
          appointmentId: 'apt-1',
          localId: 'asset-1',
          assetId: 'server-asset-old',
          filename: 'kitchen.jpg',
          contentType: 'image/jpeg',
          blobUrl: '',
          status: 'error',
          progress: 0,
          uploadUrl: null,
          storageKey: null,
          blob: persistedBlob,
        },
      ])
      .mockResolvedValueOnce([
        {
          appointmentId: 'apt-1',
          localId: 'asset-1',
          assetId: 'server-asset-old',
          filename: 'kitchen.jpg',
          contentType: 'image/jpeg',
          blobUrl: '',
          status: 'error',
          progress: 0,
          uploadUrl: null,
          storageKey: null,
          blob: persistedBlob,
        },
      ]);
    (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce('blob:asset-1');
    mockApiPost
      .mockResolvedValueOnce({
        data: {
          assetId: 'server-asset-2',
          uploadUrl: 'https://upload.example.com/2',
          storageKey: 'inspections/2.jpg',
          expiresAt: '2026-03-25T12:00:00Z',
        },
      })
      .mockResolvedValueOnce({ data: { ok: true } });

    const { result } = renderHook(() => useAssetUpload('apt-1'));

    await waitFor(() => expect(result.current.assets).toHaveLength(1));

    await act(async () => {
      await result.current.retryFailed();
    });

    expect(mockRemovePendingAsset).toHaveBeenCalledWith('asset-1');
    await waitFor(() =>
      expect(result.current.completedAssets).toEqual([
        { assetId: 'server-asset-2', storageKey: 'inspections/2.jpg' },
      ]),
    );
  });
});
