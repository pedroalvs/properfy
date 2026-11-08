import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  PropertyFileType,
  PropertyFileResponse,
  PresignPropertyFileUploadResponse,
} from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';
import { putToSignedUrl, confirmPropertyFileUpload } from '../lib/upload-core';
import { resolveFileErrorMessage } from '../lib/file-errors';

export interface UploadPropertyFileInput {
  file: File;
  type: PropertyFileType;
  propertyId: string;
  appointmentId?: string;
}

export interface UsePropertyFileUploadReturn {
  /** Full flow (presign → PUT → confirm + invalidate + snackbar). Returns true on success. */
  upload: (input: UploadPropertyFileInput) => Promise<boolean>;
  /**
   * Single-file primitive (presign → PUT → confirm) with no invalidation/snackbar.
   * Reused by the issue-photo flow; throws on failure for per-photo handling.
   */
  uploadOne: (input: UploadPropertyFileInput) => Promise<PropertyFileResponse>;
  isUploading: boolean;
  uploadError: string | null;
}

async function presignNewUpload(
  input: UploadPropertyFileInput,
): Promise<PresignPropertyFileUploadResponse> {
  const { data, error, response } = await api.POST('/v1/property-files/presign', {
    body: {
      propertyId: input.propertyId,
      appointmentId: input.appointmentId,
      type: input.type,
      fileName: input.file.name,
      mime: input.file.type,
      sizeBytes: input.file.size,
    },
  });
  if (error) throw toApiError(error, (response as Response | undefined)?.status);
  return (data as { data: PresignPropertyFileUploadResponse }).data;
}

/**
 * Upload a property file via the presign → PUT → confirm flow (F10 C.2),
 * mirroring `useInspectorDocumentUpload`. The declared mime/size are validated by
 * the server (presign + confirm); a rejection (C.A5) or 503 (D16) is surfaced by
 * `resolveFileErrorMessage`. On success invalidates the `property-files` prefix
 * (so both the appointment and property panels refresh — C.A1) plus the two list
 * prefixes (row/detail counts).
 */
export function usePropertyFileUpload(): UsePropertyFileUploadReturn {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadOne = useCallback(
    async (input: UploadPropertyFileInput): Promise<PropertyFileResponse> => {
      const presign = await presignNewUpload(input);
      await putToSignedUrl(presign.uploadUrl, input.file);
      return confirmPropertyFileUpload(presign.fileId, crypto.randomUUID());
    },
    [],
  );

  const upload = useCallback(
    async (input: UploadPropertyFileInput): Promise<boolean> => {
      setUploadError(null);
      setIsUploading(true);
      try {
        await uploadOne(input);
        await queryClient.invalidateQueries({ queryKey: ['property-files'] });
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['properties'] });
        showSuccess('File uploaded');
        return true;
      } catch (err) {
        const msg = resolveFileErrorMessage(err, 'Upload failed');
        setUploadError(msg);
        showError(msg);
        return false;
      } finally {
        setIsUploading(false);
      }
    },
    [uploadOne, queryClient, showSuccess, showError],
  );

  return { upload, uploadOne, isUploading, uploadError };
}
