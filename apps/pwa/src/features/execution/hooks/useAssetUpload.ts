import { useState, useCallback } from 'react';
import { apiPost } from '@/hooks/useApiQuery';
import type { AssetUploadState } from '../types';

interface PresignResponse {
  data: {
    assetId: string;
    uploadUrl: string;
    storageKey: string;
    expiresAt: string;
  };
}

export function useAssetUpload(appointmentId: string) {
  const [assets, setAssets] = useState<AssetUploadState[]>([]);

  const addAsset = useCallback(async (file: File) => {
    const localId = crypto.randomUUID();
    const blobUrl = URL.createObjectURL(file);

    const newAsset: AssetUploadState = {
      localId,
      assetId: null,
      filename: file.name,
      contentType: file.type,
      blobUrl,
      status: 'pending',
      progress: 0,
      uploadUrl: null,
      storageKey: null,
    };

    setAssets((prev) => [...prev, newAsset]);

    try {
      setAssets((prev) =>
        prev.map((a) => (a.localId === localId ? { ...a, status: 'uploading' as const } : a)),
      );

      const presign = await apiPost<PresignResponse>(
        `/v1/inspector/appointments/${appointmentId}/assets`,
        { kind: 'PHOTO' as const, mimeType: file.type, fileName: file.name },
      );

      let currentAssetId = presign.data.assetId;
      const { uploadUrl, storageKey } = presign.data;

      setAssets((prev) =>
        prev.map((a) => (a.localId === localId ? { ...a, assetId: currentAssetId, uploadUrl, storageKey } : a)),
      );

      const doUpload = (url: string): Promise<number> =>
        new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', url);
          xhr.setRequestHeader('Content-Type', file.type);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              setAssets((prev) =>
                prev.map((a) => (a.localId === localId ? { ...a, progress } : a)),
              );
            }
          };

          xhr.onload = () => resolve(xhr.status);
          xhr.onerror = () => reject(new Error('Upload network error'));
          xhr.send(file);
        });

      let status = await doUpload(uploadUrl);

      // Retry once with a fresh presigned URL on 403
      if (status === 403) {
        const retryPresign = await apiPost<PresignResponse>(
          `/v1/inspector/appointments/${appointmentId}/assets`,
          { kind: 'PHOTO' as const, mimeType: file.type, fileName: file.name },
        );
        const retryUrl = retryPresign.data.uploadUrl;
        const retryStorageKey = retryPresign.data.storageKey;
        currentAssetId = retryPresign.data.assetId;
        setAssets((prev) =>
          prev.map((a) =>
            a.localId === localId
              ? { ...a, assetId: currentAssetId, uploadUrl: retryUrl, storageKey: retryStorageKey, progress: 0 }
              : a,
          ),
        );
        status = await doUpload(retryUrl);
      }

      if (status >= 200 && status < 300) {
        // Confirm the upload with the backend before marking as done
        await apiPost(
          `/v1/inspector/appointments/${appointmentId}/assets/${currentAssetId}/confirm`,
          {},
        );

        setAssets((prev) =>
          prev.map((a) =>
            a.localId === localId ? { ...a, status: 'done' as const, progress: 100 } : a,
          ),
        );
      } else {
        throw new Error(`Upload failed with status ${status}`);
      }
    } catch {
      setAssets((prev) =>
        prev.map((a) =>
          a.localId === localId ? { ...a, status: 'error' as const } : a,
        ),
      );
    }
  }, [appointmentId]);

  const retryAsset = useCallback(async (localId: string, file: File) => {
    setAssets((prev) => prev.filter((a) => a.localId !== localId));
    await addAsset(file);
  }, [addAsset]);

  const removeAsset = useCallback((localId: string) => {
    setAssets((prev) => {
      const asset = prev.find((a) => a.localId === localId);
      if (asset) URL.revokeObjectURL(asset.blobUrl);
      return prev.filter((a) => a.localId !== localId);
    });
  }, []);

  const completedAssets: Array<{ assetId: string; storageKey: string }> = assets
    .filter((a) => a.status === 'done' && a.assetId && a.storageKey)
    .map((a) => ({ assetId: a.assetId!, storageKey: a.storageKey! }));

  const retryFailed = useCallback(() => {
    // Remove failed assets so the user can re-add them
    setAssets((prev) => {
      for (const a of prev) {
        if (a.status === 'error') URL.revokeObjectURL(a.blobUrl);
      }
      return prev.filter((a) => a.status !== 'error');
    });
  }, []);

  return { assets, addAsset, retryAsset, removeAsset, retryFailed, completedAssets };
}
