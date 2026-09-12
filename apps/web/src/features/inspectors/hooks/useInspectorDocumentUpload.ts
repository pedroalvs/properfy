import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useSnackbar } from '@/hooks/useSnackbar';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

/** No existing upload-timeout convention in the codebase to reuse — 60s default. */
const UPLOAD_TIMEOUT_MS = 60_000;

export interface UseInspectorDocumentUploadReturn {
  upload: (inspectorId: string, kind: 'INSURANCE' | 'POLICE_CHECK', file: File) => Promise<boolean>;
  isUploading: boolean;
  uploadError: string | null;
}

/**
 * `/documents/presign` and `/documents/confirm` declare no Fastify response
 * schema, so the generated OpenAPI type has `content?: never` for their 200s
 * (same gap as WI-15's PWA photo routes). Fixing that is a backend change out
 * of this PR's web-only scope, so the response body shape is asserted here —
 * request paths/params/bodies are fully typed from the generated contract.
 */
interface PresignResponseBody {
  data: { uploadUrl: string; storageKey: string; expiresAt: string };
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
        '/v1/inspectors/{inspectorId}/documents/presign',
        {
          params: { path: { inspectorId } },
          body: { kind, mimeType: file.type, fileName: file.name },
        },
      );
      if (presignErr || !presignData) throw new Error('Failed to get upload URL');
      const { uploadUrl, storageKey } = (presignData as unknown as PresignResponseBody).data;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
      let putRes: Response;
      try {
        putRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
          signal: controller.signal,
        });
      } catch (fetchErr) {
        if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
          throw new Error('Upload timed out');
        }
        throw fetchErr;
      } finally {
        clearTimeout(timeoutId);
      }
      if (!putRes.ok) throw new Error('Upload failed');

      const { error: confirmErr } = await api.POST(
        '/v1/inspectors/{inspectorId}/documents/confirm',
        {
          params: { path: { inspectorId } },
          body: { kind, storageKey, fileName: file.name },
        },
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
