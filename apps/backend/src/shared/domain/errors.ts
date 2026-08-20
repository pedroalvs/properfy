export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 404, details);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message, 403);
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ConflictError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 409, details);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown, code = 'VALIDATION_ERROR') {
    super(code, message, 400, details);
    this.name = 'ValidationError';
  }
}

export class TooManyRequestsError extends DomainError {
  /** Seconds, always — that is what the shared client types
   * (`retryAfter?: number`) and what it would otherwise parse out of the
   * `Retry-After` header. Typed as a number on purpose: the web's
   * `withRetryAfter` only falls back to that header when this is undefined, so
   * a non-numeric value (an ISO timestamp, "1 minute") silently suppresses the
   * real one — worse than omitting it entirely. */
  constructor(code: string, message: string, public readonly retryAfter?: number) {
    super(code, message, 429);
    this.name = 'TooManyRequestsError';
  }
}

/** 422 Unprocessable Entity — body is syntactically valid but semantically rejected (e.g. unsafe HTML). */
export class UnprocessableEntityError extends DomainError {
  constructor(message: string, details?: unknown, code = 'UNPROCESSABLE_ENTITY') {
    super(code, message, 422, details);
    this.name = 'UnprocessableEntityError';
  }
}

/**
 * 503 Service Unavailable — a file upload/download was attempted but object
 * storage is not configured in this environment. Thrown instead of silently
 * accepting the upload and returning a fabricated URL that points at nothing.
 * Staging/production require the SUPABASE_S3_* vars at boot, so this only ever
 * surfaces in a dev server without storage configured.
 */
export class StorageNotConfiguredError extends DomainError {
  constructor(
    // Neutral default: some callers need more than SUPABASE_S3_* (branding also
    // requires SUPABASE_STORAGE_PUBLIC_URL), so each fallback passes an
    // operation-specific message naming the exact vars it needs.
    message = 'File storage is not configured in this environment. Configure the required Supabase storage settings to enable uploads.',
  ) {
    super('STORAGE_NOT_CONFIGURED', message, 503);
    this.name = 'StorageNotConfiguredError';
  }
}
