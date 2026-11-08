import { FILE_STORAGE_UNAVAILABLE_MESSAGE } from '@properfy/shared';
import { ApiError, toApiError, getErrorMessage } from '@/lib/api-error';

/** True when the error is the backend's "storage not configured/unavailable" (503). */
export function isStorageUnavailable(err: ApiError): boolean {
  return err.status === 503 || err.code === 'STORAGE_NOT_CONFIGURED';
}

/**
 * Resolve a file-operation error to a user-facing message. Storage-unavailable
 * (503 / `STORAGE_NOT_CONFIGURED`) maps to the single shared string used across
 * web/PWA/portal (D16) — overriding the raw backend text that `getErrorMessage`
 * would otherwise surface via its allowlist. Everything else defers to the shared
 * `getErrorMessage`, so a 4xx rejection message (C.A5 bad mime/size) shows
 * through while 5xx/internal errors stay behind the context `fallback`.
 */
export function resolveFileErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const apiErr = err instanceof ApiError ? err : toApiError(err);
  if (isStorageUnavailable(apiErr)) return FILE_STORAGE_UNAVAILABLE_MESSAGE;
  return getErrorMessage(apiErr, fallback);
}
