import { useCallback, useState } from 'react';
import type { PropertyFileDownloadResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';
import { resolveFileErrorMessage } from '../lib/file-errors';

export interface UseDownloadPropertyFileReturn {
  /** Fetches a fresh 5-min signed URL and opens it in a new tab. Returns the URL, or null on failure. */
  download: (fileId: string) => Promise<string | null>;
  /** The id currently being resolved, for a per-row spinner. */
  downloadingId: string | null;
}

/**
 * On-demand download of a property file (F10 C.4). Each call mints a fresh
 * 5-minute signed URL (`GET /v1/property-files/{id}/download`) and opens it in a
 * new tab, so the link is never stale. Storage-unavailable (503) surfaces the
 * shared `FILE_STORAGE_UNAVAILABLE_MESSAGE` (D16).
 */
export function useDownloadPropertyFile(): UseDownloadPropertyFileReturn {
  const { showError } = useSnackbar();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const download = useCallback(
    async (fileId: string): Promise<string | null> => {
      setDownloadingId(fileId);
      try {
        const { data, error, response } = await api.GET('/v1/property-files/{id}/download', {
          params: { path: { id: fileId } },
        });
        if (error) throw toApiError(error, (response as Response | undefined)?.status);
        const url = (data as { data: PropertyFileDownloadResponse } | undefined)?.data.url;
        if (!url) throw new Error('No download URL returned');
        window.open(url, '_blank', 'noopener,noreferrer');
        return url;
      } catch (err) {
        showError(resolveFileErrorMessage(err, 'Could not open the file'));
        return null;
      } finally {
        setDownloadingId(null);
      }
    },
    [showError],
  );

  return { download, downloadingId };
}
