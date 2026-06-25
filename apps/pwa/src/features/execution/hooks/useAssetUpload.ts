import { useState, useCallback, useEffect, useRef } from 'react';
import { apiPost } from '@/hooks/useApiQuery';
import {
  savePendingAsset,
  getPendingAssets,
  removePendingAsset,
} from '../lib/indexeddb';
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
  const assetsRef = useRef<AssetUploadState[]>([]);
  assetsRef.current = assets;

  useEffect(() => {
    let mounted = true;

    getPendingAssets().then((pending) => {
      if (!mounted) return;

      const hydratedAssets = pending
        .filter((asset) => asset.appointmentId === appointmentId && asset.blob)
        .map((asset) => ({
          ...asset,
          blobUrl: URL.createObjectURL(asset.blob!),
          status: asset.status === 'uploading' ? 'error' as const : asset.status,
          progress: asset.status === 'done' ? 100 : 0,
        }));

      setAssets((prev) => (prev.length > 0 ? prev : hydratedAssets));
    });

    return () => {
      mounted = false;
      if (typeof URL.revokeObjectURL === 'function') {
        for (const asset of assetsRef.current) {
          URL.revokeObjectURL(asset.blobUrl);
        }
      }
    };
  }, [appointmentId]);

  const persistAsset = useCallback(
    async (asset: AssetUploadState, blob?: Blob) => {
      await savePendingAsset({
        appointmentId,
        ...asset,
        blob,
      });
    },
    [appointmentId],
  );

  const uploadAsset = useCallback(async (baseAsset: AssetUploadState, file: File) => {
    let currentAsset: AssetUploadState = {
      ...baseAsset,
      status: 'uploading',
      progress: 0,
    };

    setAssets((prev) =>
      prev.some((asset) => asset.localId === baseAsset.localId)
        ? prev.map((asset) => (asset.localId === baseAsset.localId ? currentAsset : asset))
        : [...prev, currentAsset],
    );
    await persistAsset(currentAsset, file);

    try {
      const presign = await apiPost<PresignResponse>(
        `/v1/inspector/appointments/${appointmentId}/assets`,
        { kind: 'PHOTO' as const, mimeType: file.type, fileName: file.name },
      );

      let currentAssetId = presign.data.assetId;
      currentAsset = {
        ...currentAsset,
        assetId: currentAssetId,
        uploadUrl: presign.data.uploadUrl,
        storageKey: presign.data.storageKey,
      };
      await persistAsset(currentAsset, file);

      setAssets((prev) =>
        prev.map((asset) => (asset.localId === baseAsset.localId ? currentAsset : asset)),
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
                prev.map((asset) =>
                  asset.localId === baseAsset.localId ? { ...asset, progress } : asset,
                ),
              );
            }
          };

          xhr.onload = () => resolve(xhr.status);
          xhr.onerror = () => reject(new Error('Upload network error'));
          xhr.send(file);
        });

      let status = await doUpload(currentAsset.uploadUrl!);

      if (status === 403) {
        const retryPresign = await apiPost<PresignResponse>(
          `/v1/inspector/appointments/${appointmentId}/assets`,
          { kind: 'PHOTO' as const, mimeType: file.type, fileName: file.name },
        );
        currentAssetId = retryPresign.data.assetId;
        currentAsset = {
          ...currentAsset,
          assetId: currentAssetId,
          uploadUrl: retryPresign.data.uploadUrl,
          storageKey: retryPresign.data.storageKey,
          progress: 0,
        };
        await persistAsset(currentAsset, file);

        setAssets((prev) =>
          prev.map((asset) => (asset.localId === baseAsset.localId ? currentAsset : asset)),
        );
        status = await doUpload(currentAsset.uploadUrl!);
      }

      if (status >= 200 && status < 300) {
        await apiPost(
          `/v1/inspector/appointments/${appointmentId}/assets/${currentAssetId}/confirm`,
          {},
        );

        await removePendingAsset(baseAsset.localId);

        setAssets((prev) =>
          prev.map((asset) =>
            asset.localId === baseAsset.localId
              ? { ...asset, status: 'done' as const, progress: 100, assetId: currentAssetId, storageKey: currentAsset.storageKey }
              : asset,
          ),
        );
        return;
      }

      throw new Error(`Upload failed with status ${status}`);
    } catch {
      const failedAsset: AssetUploadState = {
        ...currentAsset,
        status: 'error',
        progress: 0,
      };
      setAssets((prev) =>
        prev.map((asset) => (asset.localId === baseAsset.localId ? failedAsset : asset)),
      );
      await persistAsset(failedAsset, file);
    }
  }, [appointmentId, persistAsset]);

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

    await persistAsset(newAsset, file);
    setAssets((prev) => [...prev, newAsset]);
    await uploadAsset(newAsset, file);
  }, [persistAsset, uploadAsset]);

  const retryAsset = useCallback(async (localId: string, file: File) => {
    setAssets((prev) => prev.filter((a) => a.localId !== localId));
    await removePendingAsset(localId);
    await addAsset(file);
  }, [addAsset]);

  const removeAsset = useCallback(async (localId: string) => {
    setAssets((prev) => {
      const asset = prev.find((a) => a.localId === localId);
      if (asset) URL.revokeObjectURL(asset.blobUrl);
      return prev.filter((a) => a.localId !== localId);
    });
    await removePendingAsset(localId);
  }, []);

  const completedAssets: Array<{ assetId: string; storageKey: string }> = assets
    .filter((a) => a.status === 'done' && a.assetId && a.storageKey)
    .map((a) => ({ assetId: a.assetId!, storageKey: a.storageKey! }));

  const retryFailed = useCallback(async () => {
    const pendingAssets = await getPendingAssets();
    const failedAssets = assetsRef.current.filter((asset) => asset.status === 'error');

    for (const asset of failedAssets) {
      const persisted = pendingAssets.find(
        (pending) => pending.appointmentId === appointmentId && pending.localId === asset.localId,
      );
      if (!persisted?.blob) {
        continue;
      }

      const file = new File([persisted.blob], asset.filename, { type: asset.contentType });
      await uploadAsset(
        {
          ...asset,
          status: 'pending',
          progress: 0,
        },
        file,
      );
    }
  }, [appointmentId, uploadAsset]);

  return { assets, addAsset, retryAsset, removeAsset, retryFailed, completedAssets };
}
