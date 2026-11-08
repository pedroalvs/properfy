import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PropertyFileType,
  type PresignPropertyFileUploadResponse,
  type PropertyFileResponse,
} from '@properfy/shared';
import { apiPost, type SuccessResponse } from '@/hooks/useApiQuery';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { propertyFileErrorMessage } from '../lib/property-file-error';
import {
  canAddMorePhotos,
  checkIssuePhoto,
  photoRejectionMessage,
  MAX_ISSUE_PHOTOS,
} from '../lib/issue-photo-validation';

export type LocalPhotoStatus = 'uploading' | 'confirmed' | 'failed';

export interface LocalPhoto {
  localId: string;
  file: File;
  previewUrl: string | null;
  status: LocalPhotoStatus;
  fileId: string | null;
  error: string | null;
}

interface UseIssuePhotoUploadArgs {
  propertyId: string;
  appointmentId: string;
}

function createPreviewUrl(file: File): string | null {
  try {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      return URL.createObjectURL(file);
    }
  } catch {
    /* object URLs unavailable (non-browser/test) — render without a preview */
  }
  return null;
}

function revokePreviewUrl(url: string | null): void {
  if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Owns the per-photo upload state machine for an issue (D12). Each photo runs
 * presign → PUT(signed URL) → confirm independently, with its own progress/error;
 * one photo's failure never discards the already-confirmed ones. A confirmed
 * photo stays PENDING server-side until the issue is created (which links + flips
 * it READY). Online-only — no queue, no auto-retry (the user retries explicitly).
 */
export function useIssuePhotoUpload({ propertyId, appointmentId }: UseIssuePhotoUploadArgs) {
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const photosRef = useRef<LocalPhoto[]>([]);

  const commit = useCallback((next: (prev: LocalPhoto[]) => LocalPhoto[]) => {
    setPhotos((prev) => {
      const value = next(prev);
      photosRef.current = value;
      return value;
    });
  }, []);

  const markConfirmed = useCallback(
    (localId: string, fileId: string) =>
      commit((prev) =>
        prev.map((p) => (p.localId === localId ? { ...p, status: 'confirmed', fileId, error: null } : p)),
      ),
    [commit],
  );

  const markFailed = useCallback(
    (localId: string, message: string) =>
      commit((prev) =>
        prev.map((p) => (p.localId === localId ? { ...p, status: 'failed', error: message } : p)),
      ),
    [commit],
  );

  const uploadOne = useCallback(
    async (localId: string, file: File) => {
      try {
        const presign = await apiPost<SuccessResponse<PresignPropertyFileUploadResponse>>(
          '/v1/property-files/presign',
          {
            propertyId,
            appointmentId,
            type: PropertyFileType.ISSUE,
            fileName: file.name,
            mime: file.type,
            sizeBytes: file.size,
          },
        );
        const { fileId, uploadUrl } = presign.data;

        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        if (!putRes.ok) {
          markFailed(localId, 'Couldn’t upload the photo. Tap to retry.');
          return;
        }

        await apiPost<SuccessResponse<PropertyFileResponse>>(
          '/v1/property-files/confirm',
          { fileId },
          { 'Idempotency-Key': generateIdempotencyKey() },
        );
        markConfirmed(localId, fileId);
      } catch (err) {
        markFailed(localId, propertyFileErrorMessage(err));
      }
    },
    [propertyId, appointmentId, markConfirmed, markFailed],
  );

  const addPhoto = useCallback(
    (file: File) => {
      const rejection = checkIssuePhoto(file);
      if (rejection) {
        setAddError(photoRejectionMessage(rejection));
        return;
      }
      if (!canAddMorePhotos(photosRef.current.length)) {
        setAddError(`You can add up to ${MAX_ISSUE_PHOTOS} photos.`);
        return;
      }
      setAddError(null);
      const localId = generateIdempotencyKey();
      const previewUrl = createPreviewUrl(file);
      commit((prev) => [
        ...prev,
        { localId, file, previewUrl, status: 'uploading', fileId: null, error: null },
      ]);
      void uploadOne(localId, file);
    },
    [commit, uploadOne],
  );

  const retryPhoto = useCallback(
    (localId: string) => {
      const target = photosRef.current.find((p) => p.localId === localId);
      if (!target || target.status === 'uploading') return;
      commit((prev) =>
        prev.map((p) => (p.localId === localId ? { ...p, status: 'uploading', error: null } : p)),
      );
      void uploadOne(localId, target.file);
    },
    [commit, uploadOne],
  );

  const removePhoto = useCallback(
    (localId: string) => {
      const target = photosRef.current.find((p) => p.localId === localId);
      revokePreviewUrl(target?.previewUrl ?? null);
      commit((prev) => prev.filter((p) => p.localId !== localId));
    },
    [commit],
  );

  const reset = useCallback(() => {
    for (const p of photosRef.current) revokePreviewUrl(p.previewUrl);
    setAddError(null);
    commit(() => []);
  }, [commit]);

  // Revoke any outstanding object URLs on unmount (no leak).
  useEffect(
    () => () => {
      for (const p of photosRef.current) revokePreviewUrl(p.previewUrl);
    },
    [],
  );

  const isUploading = photos.some((p) => p.status === 'uploading');
  const hasFailed = photos.some((p) => p.status === 'failed');
  const confirmedFileIds = photos
    .filter((p): p is LocalPhoto & { fileId: string } => p.status === 'confirmed' && p.fileId !== null)
    .map((p) => p.fileId);

  return {
    photos,
    addError,
    addPhoto,
    retryPhoto,
    removePhoto,
    reset,
    isUploading,
    hasFailed,
    confirmedFileIds,
  };
}
