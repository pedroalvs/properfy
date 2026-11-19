import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiGetBlob } from '@/hooks/useApiQuery';
import { ApiError, isNetworkError, getErrorMessage } from '@/lib/api-error';

export type SheetFormat = 'pdf' | 'xlsx';

const OBJECT_URL_TTL_MS = 30_000;

/** Prefer the server's `Content-Disposition` filename, else `route-{date}.{ext}`. */
function filenameFrom(header: string | null, date: string, format: SheetFormat): string {
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i.exec(header ?? '');
  const raw = match?.[1]?.trim();
  if (raw) {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return `route-${date}.${format}`;
}

/** Create a temporary object URL, click an anchor to save it, then revoke after 30 s. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_TTL_MS);
}

/**
 * Downloads the route sheet (PDF/XLSX) for a day. Never cached (a fresh blob
 * each time). Surfaces a short, user-facing error for 404 / offline; other
 * errors fall back to the server message.
 */
export function useRouteSheetDownload(date: string) {
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation<void, ApiError, SheetFormat>({
    mutationFn: async (format) => {
      const { blob, response } = await apiGetBlob(`/v1/inspector/day-plans/${date}/sheet`, { format });
      const filename = filenameFrom(response.headers.get('Content-Disposition'), date, format);
      triggerDownload(blob, filename);
    },
    onMutate: () => setError(null),
    onError: (err) => {
      if (isNetworkError(err)) {
        setError("You're offline. Connect to download the route sheet.");
      } else if (err instanceof ApiError && err.status === 404) {
        setError("This route isn't ready yet.");
      } else {
        setError(getErrorMessage(err));
      }
    },
  });

  return {
    download: (format: SheetFormat) => mutation.mutate(format),
    pendingFormat: mutation.isPending ? mutation.variables ?? null : null,
    isDownloading: mutation.isPending,
    error,
    clearError: () => setError(null),
  };
}
