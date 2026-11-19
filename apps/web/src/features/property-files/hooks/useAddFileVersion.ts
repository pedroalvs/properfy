import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PresignPropertyFileUploadResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';
import { putToSignedUrl, confirmPropertyFileUpload } from '../lib/upload-core';
import { resolveFileErrorMessage } from '../lib/file-errors';

export interface UseAddFileVersionReturn {
  addVersion: (sourceFileId: string, file: File) => Promise<boolean>;
  isUploading: boolean;
}

/**
 * Add a new version of an existing file (F10 C.6/C.A3): presign the version group
 * (`POST /v1/property-files/{id}/versions`) → PUT → confirm. The previous version
 * stays READY, so both remain downloadable from the Versions drawer. Invalidates
 * the `property-files` prefix (+ list prefixes for counts).
 */
export function useAddFileVersion(): UseAddFileVersionReturn {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();
  const [isUploading, setIsUploading] = useState(false);

  const addVersion = useCallback(
    async (sourceFileId: string, file: File): Promise<boolean> => {
      setIsUploading(true);
      try {
        const { data, error, response } = await api.POST('/v1/property-files/{id}/versions', {
          params: { path: { id: sourceFileId } },
          body: { fileName: file.name, mime: file.type, sizeBytes: file.size },
        });
        if (error) throw toApiError(error, (response as Response | undefined)?.status);
        const presign = (data as { data: PresignPropertyFileUploadResponse }).data;
        await putToSignedUrl(presign.uploadUrl, file);
        await confirmPropertyFileUpload(presign.fileId, crypto.randomUUID());
        await queryClient.invalidateQueries({ queryKey: ['property-files'] });
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
        queryClient.invalidateQueries({ queryKey: ['properties'] });
        showSuccess('New version uploaded');
        return true;
      } catch (err) {
        showError(resolveFileErrorMessage(err, 'Could not upload new version'));
        return false;
      } finally {
        setIsUploading(false);
      }
    },
    [queryClient, showSuccess, showError],
  );

  return { addVersion, isUploading };
}
