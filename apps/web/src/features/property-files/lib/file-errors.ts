import { FILE_STORAGE_UNAVAILABLE_MESSAGE } from '@properfy/shared';
import { ApiError, toApiError, getErrorMessage } from '@/lib/api-error';

/** True when the error is the backend's "storage not configured/unavailable" (503). */
export function isStorageUnavailable(err: ApiError): boolean {
  return err.status === 503 || err.code === 'STORAGE_NOT_CONFIGURED';
}

/** Storage rejected the file for its format (HTTP 415 on the signed-URL PUT). */
export const FILE_TYPE_REJECTED_MESSAGE = "This file type isn't accepted.";
/** Storage rejected the file for its size (HTTP 413 on the signed-URL PUT). */
export const FILE_TOO_LARGE_MESSAGE = 'This file is too large.';

/**
 * Resolve a file-operation error to a user-facing message. Storage-unavailable
 * (503 / `STORAGE_NOT_CONFIGURED`) maps to the single shared string used across
 * web/PWA/portal (D16) — overriding the raw backend text that `getErrorMessage`
 * would otherwise surface via its allowlist. Everything else defers to the shared
 * `getErrorMessage`, so a 4xx rejection message (C.A5 bad mime/size) shows
 * through while 5xx/internal errors stay behind the context `fallback`.
 *
 * Storage rejects an upload on the signed-URL PUT with a bare status and no API
 * envelope, so map those explicitly (C.A5): 415 → unsupported type, 413 → too
 * large. The two are kept as separate sentences so the user knows whether to pick
 * a different file or a smaller one.
 */
export function resolveFileErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const apiErr = err instanceof ApiError ? err : toApiError(err);
  if (isStorageUnavailable(apiErr)) return FILE_STORAGE_UNAVAILABLE_MESSAGE;
  if (apiErr.status === 415) return FILE_TYPE_REJECTED_MESSAGE;
  if (apiErr.status === 413) return FILE_TOO_LARGE_MESSAGE;
  return getErrorMessage(apiErr, fallback);
}
