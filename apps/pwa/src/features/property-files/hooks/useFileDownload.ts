import { useCallback, useState } from 'react';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import { propertyFileErrorMessage } from '../lib/property-file-error';

/**
 * Fetch a short-lived (5-min) signed download URL for one file.
 *
 * openapi-fetch infers this 200-only path-param GET awkwardly (the typed result
 * collapses to `never` — same quirk the web's `useInvoiceDownload` works around),
 * so the awaited result is cast to its real runtime shape. `response.status` is
 * still populated at runtime and feeds the 404/503 error mapping.
 */
export async function fetchDownloadUrl(fileId: string): Promise<string> {
  const result = (await api.GET('/v1/property-files/{id}/download', {
    params: { path: { id: fileId } },
  })) as {
    data?: { data: { url: string; expiresAt: string } };
    error?: unknown;
    response?: Response;
  };
  if (result.error || !result.data) {
    throw toApiError(result.error ?? new Error('download failed'), result.response?.status);
  }
  return result.data.data.url;
}

/**
 * Open a file by its id: fetch the signed URL and open it in a new tab (the
 * browser previews an image/PDF and downloads anything else — C.4). Tracks the
 * in-flight file id and surfaces a mapped error (404 → "no longer available",
 * C.A2). Online-only.
 */
export function useFileDownload() {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openFile = useCallback(async (fileId: string) => {
    setPendingId(fileId);
    setError(null);
    try {
      const url = await fetchDownloadUrl(fileId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(propertyFileErrorMessage(err));
    } finally {
      setPendingId(null);
    }
  }, []);

  return { openFile, pendingId, error };
}
