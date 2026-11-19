import { FILE_STORAGE_UNAVAILABLE_MESSAGE } from '@properfy/shared';
import { getErrorMessage, isNetworkError, toApiError } from '@/lib/api-error';

/**
 * Map an error from a property-file / property-issue call to a clear, safe
 * message for the field UI (C.A5 — a rejected format/size or an unavailable
 * resource must read clearly, never a blank screen or a leaked internal).
 *
 * - network/offline → connect-and-retry (the flows are online-only)
 * - 503 → the shared `FILE_STORAGE_UNAVAILABLE_MESSAGE` (storage not configured)
 * - 404 → "no longer available" (never reveal that the resource exists — C.A2/D28)
 * - 409 → the photo-link conflict (a photo failed to attach) → retry
 * - 5xx → generic retry (no internals)
 * - otherwise (400/413 bad type/size, 403, 429) → the server's deliberate,
 *   operator-safe message via `getErrorMessage` (C.A5)
 */
export function propertyFileErrorMessage(err: unknown): string {
  const apiError = toApiError(err);
  if (isNetworkError(apiError)) return 'You’re offline. Connect and try again.';
  if (apiError.status === 503) return FILE_STORAGE_UNAVAILABLE_MESSAGE;
  if (apiError.status === 404) return 'This file is no longer available.';
  if (apiError.status === 409) return 'Some photos couldn’t be attached. Please try again.';
  if (apiError.status >= 500) return 'Couldn’t complete that. Please try again.';
  return getErrorMessage(err);
}
