/**
 * Framework-free normalization of Properfy API errors.
 *
 * The backend always answers failures with the envelope
 * `{ error: { code, message, details, retryAfter } }`; this module turns
 * whatever a frontend caught (envelope object, thrown fetch TypeError,
 * already-normalized ApiError, anything else) into a single `ApiError`
 * shape plus a user-facing message policy shared by web and PWA.
 */

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

/** Synthetic status used when the request never reached the backend. */
export const NETWORK_ERROR_STATUS = 0;

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const FORBIDDEN_MESSAGE = "You don't have permission to perform this action.";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: ApiErrorDetail[] | string[],
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Offline-aware network failure text. Guarded for non-browser runtimes. */
function networkErrorMessage(): string {
  // Shared package compiles without DOM libs — reach navigator via globalThis.
  const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
  if (typeof nav !== 'undefined' && nav.onLine === false) {
    return 'You appear to be offline. Check your connection and try again.';
  }
  return 'Network error — please try again.';
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: ApiErrorDetail[] | string[];
    retryAfter?: number;
  };
  status?: number;
  message?: string;
}

/**
 * Normalize anything caught from an API call into an `ApiError`.
 *
 * @param status HTTP status of the response, when the caller has it
 *   (e.g. `response.status` from openapi-fetch). Takes precedence over
 *   any status carried by the error object itself.
 */
export function toApiError(error: unknown, status?: number): ApiError {
  if (error instanceof ApiError) return error;

  // fetch itself failed (offline, DNS, CORS) — the request never landed.
  if (error instanceof TypeError) {
    return new ApiError(NETWORK_ERROR_STATUS, networkErrorMessage(), 'NETWORK_ERROR');
  }

  if (error && typeof error === 'object') {
    const env = error as ErrorEnvelope;
    if (env.error?.message) {
      return new ApiError(
        status ?? env.status ?? 422,
        env.error.message,
        env.error.code,
        env.error.details,
        env.error.retryAfter,
      );
    }
    if (typeof env.message === 'string' && env.message) {
      return new ApiError(status ?? env.status ?? 500, env.message);
    }
  }

  return new ApiError(status ?? 500, GENERIC_MESSAGE, 'INTERNAL_ERROR');
}

/** True when the failure never reached the backend (offline, DNS, CORS). */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === NETWORK_ERROR_STATUS || err.code === 'NETWORK_ERROR';
  }
  return err instanceof TypeError;
}

/**
 * User-facing message policy:
 * - network failure → offline-aware text
 * - 5xx / INTERNAL_ERROR → `fallback` (raw internals never surface)
 * - 403 without a backend message → permission text
 * - 429 without a backend message → retry-after text
 * - otherwise → backend message verbatim, `fallback` when empty
 */
export function getErrorMessage(err: unknown, fallback?: string): string {
  const apiError = toApiError(err);

  if (isNetworkError(apiError)) return networkErrorMessage();
  if (apiError.status >= 500 || apiError.code === 'INTERNAL_ERROR') {
    return fallback ?? GENERIC_MESSAGE;
  }

  const message = apiError.message.trim();
  if (apiError.status === 403 && !message) return FORBIDDEN_MESSAGE;
  if (apiError.status === 429 && !message) {
    return apiError.retryAfter !== undefined
      ? `Too many requests — try again in ${apiError.retryAfter}s.`
      : 'Too many requests — please try again.';
  }

  return message || fallback || GENERIC_MESSAGE;
}

/** Field-level messages from `details` entries that name a field. */
export function getFieldErrors(err: unknown): Record<string, string> {
  const apiError = toApiError(err);
  const fieldErrors: Record<string, string> = {};
  if (!Array.isArray(apiError.details)) return fieldErrors;
  for (const detail of apiError.details) {
    if (detail && typeof detail === 'object' && detail.field) {
      fieldErrors[detail.field] = detail.message;
    }
  }
  return fieldErrors;
}
