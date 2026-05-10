import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useSnackbar } from '@/hooks/useSnackbar';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

export interface UseInspectorDocumentUploadReturn {
  upload: (inspectorId: string, kind: 'INSURANCE' | 'POLICE_CHECK', file: File) => Promise<boolean>;
  isUploading: boolean;
  uploadError: string | null;
}

export function useInspectorDocumentUpload(): UseInspectorDocumentUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();

  const upload = useCallback(async (
    inspectorId: string,
    kind: 'INSURANCE' | 'POLICE_CHECK',
    file: File,
  ): Promise<boolean> => {
    if (!ALLOWED_MIME.includes(file.type)) {
      setUploadError('Only PDF, JPEG or PNG files are allowed.');
      return false;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setUploadError('File must be under 20 MB.');
      return false;
    }
    setUploadError(null);
    setIsUploading(true);
    try {
      const { data: presignData, error: presignErr } = await api.POST(
        `/v1/inspectors/{inspectorId}/documents/presign` as never,
        { params: { path: { inspectorId } }, body: { kind, mimeType: file.type, fileName: file.name } } as never,
      );
      if (presignErr || !presignData) throw new Error('Failed to get upload URL');
      // UX-baseline cleanup: backend now wraps the response in
      // `{ data: { uploadUrl, storageKey, expiresAt } }`.
      const { uploadUrl, storageKey } = (presignData as { data: { uploadUrl: string; storageKey: string } }).data;

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!putRes.ok) throw new Error('Upload failed');

      const { error: confirmErr } = await api.POST(
        `/v1/inspectors/{inspectorId}/documents/confirm` as never,
        { params: { path: { inspectorId } }, body: { kind, storageKey, fileName: file.name, mimeType: file.type, sizeBytes: file.size } } as never,
      );
      if (confirmErr) throw new Error('Failed to confirm upload');

      await queryClient.invalidateQueries({ queryKey: ['inspectors'] });
      showSuccess(`${kind === 'INSURANCE' ? 'Insurance' : 'Police check'} document uploaded`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(msg);
      showError(msg);
      return false;
    } finally {
      setIsUploading(false);
    }
  }, [queryClient, showSuccess, showError]);

  return { upload, isUploading, uploadError };
}
