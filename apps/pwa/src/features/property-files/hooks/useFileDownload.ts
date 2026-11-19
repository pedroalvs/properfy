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
 *
 * iOS Safari (the field device) blocks `window.open()` called AFTER an await — it
 * is considered disconnected from the user gesture — so the tab is opened
 * synchronously here, within the tap, and pointed at the URL once it resolves
 * (the same pattern as `downloadInvoice`). `window.open(..., 'noopener')` returns
 * null, which would break that, so `opener` is nulled manually for the same
 * reverse-tab-nabbing protection. A popup blocked entirely falls back to same-tab
 * navigation.
 */
export function useFileDownload() {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openFile = useCallback(async (fileId: string) => {
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    setPendingId(fileId);
    setError(null);
    try {
      const url = await fetchDownloadUrl(fileId);
      if (win === null) {
        // Popup was blocked (never opened) — fall back to same-tab navigation.
        window.location.href = url;
      } else if (!win.closed) {
        win.location.href = url;
      }
      // else: the user closed the pre-opened tab — do nothing.
    } catch (err) {
      win?.close();
      setError(propertyFileErrorMessage(err));
    } finally {
      setPendingId(null);
    }
  }, []);

  return { openFile, pendingId, error };
}
