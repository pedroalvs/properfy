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
  constructor(code: string, message: string) {
    super(code, message, 404);
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
  constructor(code: string, message: string) {
    super(code, message, 409);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class TooManyRequestsError extends DomainError {
  constructor(code: string, message: string, public readonly retryAfter?: string) {
    super(code, message, 429);
    this.name = 'TooManyRequestsError';
  }
}
