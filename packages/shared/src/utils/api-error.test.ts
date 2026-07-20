import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  NETWORK_ERROR_STATUS,
  getErrorMessage,
  getFieldErrors,
  isNetworkError,
  toApiError,
} from './api-error';

function stubNavigatorOnLine(onLine: boolean): void {
  vi.stubGlobal('navigator', { onLine });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ApiError', () => {
  it('carries status, code, details and retryAfter', () => {
    const err = new ApiError(422, 'Invalid input', 'VALIDATION_ERROR', [
      { field: 'email', message: 'Invalid email' },
    ], 30);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(422);
    expect(err.message).toBe('Invalid input');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual([{ field: 'email', message: 'Invalid email' }]);
    expect(err.retryAfter).toBe(30);
  });
});

describe('toApiError', () => {
  it('returns an existing ApiError unchanged', () => {
    const original = new ApiError(404, 'Not found', 'NOT_FOUND');
    expect(toApiError(original)).toBe(original);
    expect(toApiError(original, 500)).toBe(original);
  });

  it('parses the backend error envelope', () => {
    const err = toApiError(
      {
        error: {
          code: 'APPOINTMENT_INVALID_TRANSITION',
          message: 'Cannot move from DONE to SCHEDULED',
          details: [{ field: 'status', message: 'Invalid transition' }],
        },
      },
      409,
    );
    expect(err.status).toBe(409);
    expect(err.code).toBe('APPOINTMENT_INVALID_TRANSITION');
    expect(err.message).toBe('Cannot move from DONE to SCHEDULED');
    expect(err.details).toEqual([{ field: 'status', message: 'Invalid transition' }]);
  });

  it('reads retryAfter from the envelope', () => {
    const err = toApiError(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests', retryAfter: 12 } },
      429,
    );
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(12);
  });

  it('defaults an envelope without status information to 422', () => {
    const err = toApiError({ error: { code: 'VALIDATION_ERROR', message: 'Bad payload' } });
    expect(err.status).toBe(422);
    expect(err.message).toBe('Bad payload');
  });

  it('wraps a fetch TypeError as a network error', () => {
    stubNavigatorOnLine(true);
    const err = toApiError(new TypeError('Failed to fetch'));
    expect(err.status).toBe(NETWORK_ERROR_STATUS);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.message).toBe('Network error — please try again.');
  });

  it('uses the offline message for network errors when navigator reports offline', () => {
    stubNavigatorOnLine(false);
    const err = toApiError(new TypeError('Failed to fetch'));
    expect(err.status).toBe(NETWORK_ERROR_STATUS);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.message).toBe('You appear to be offline. Check your connection and try again.');
  });

  it('wraps a plain Error-shaped object preserving its message', () => {
    const err = toApiError({ message: 'Boom', status: 418 });
    expect(err.status).toBe(418);
    expect(err.message).toBe('Boom');
  });

  it('prefers the explicit status argument over the object status', () => {
    const err = toApiError({ error: { message: 'Nope' }, status: 422 }, 403);
    expect(err.status).toBe(403);
  });

  it('falls back to a 500 INTERNAL_ERROR for unknown values', () => {
    const err = toApiError('what');
    expect(err.status).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).toBe('Something went wrong. Please try again.');
  });
});

describe('getErrorMessage', () => {
  it('returns the backend message verbatim for client errors', () => {
    const err = new ApiError(409, 'Appointment is not awaiting an inspector', 'APPOINTMENT_INVALID_TRANSITION');
    expect(getErrorMessage(err, 'Fallback')).toBe('Appointment is not awaiting an inspector');
  });

  it('returns the network message for status 0', () => {
    stubNavigatorOnLine(true);
    expect(getErrorMessage(new ApiError(0, 'whatever', 'NETWORK_ERROR'))).toBe(
      'Network error — please try again.',
    );
  });

  it('returns the offline message when navigator.onLine is false', () => {
    stubNavigatorOnLine(false);
    expect(getErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'You appear to be offline. Check your connection and try again.',
    );
  });

  it('uses the fallback for 5xx errors', () => {
    expect(getErrorMessage(new ApiError(500, 'ECONNREFUSED at pg'), 'Could not save')).toBe(
      'Could not save',
    );
    expect(getErrorMessage(new ApiError(503, 'upstream down'))).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('uses the fallback for INTERNAL_ERROR regardless of status', () => {
    expect(getErrorMessage(new ApiError(200, 'raw internals', 'INTERNAL_ERROR'), 'Fallback')).toBe(
      'Fallback',
    );
  });

  it('returns a permission message for 403 without a backend message', () => {
    expect(getErrorMessage(new ApiError(403, ''))).toBe(
      "You don't have permission to perform this action.",
    );
  });

  it('keeps the backend message for 403 when present', () => {
    expect(getErrorMessage(new ApiError(403, 'Inspector is denylisted for this client'))).toBe(
      'Inspector is denylisted for this client',
    );
  });

  it('formats 429 with retryAfter when there is no backend message', () => {
    expect(getErrorMessage(new ApiError(429, '', undefined, undefined, 42))).toBe(
      'Too many requests — try again in 42s.',
    );
  });

  it('formats 429 without seconds when retryAfter is absent', () => {
    expect(getErrorMessage(new ApiError(429, ''))).toBe('Too many requests — please try again.');
  });

  it('uses the backend message for 429 when present', () => {
    expect(getErrorMessage(new ApiError(429, 'Slow down, cowboy'))).toBe('Slow down, cowboy');
  });

  it('uses the fallback when the message is empty', () => {
    expect(getErrorMessage(new ApiError(400, ''), 'Fallback')).toBe('Fallback');
  });

  it('normalizes non-ApiError inputs through toApiError', () => {
    expect(getErrorMessage({ error: { message: 'Branch is inactive' } }, 'Fallback')).toBe(
      'Branch is inactive',
    );
    expect(getErrorMessage(undefined, 'Fallback')).toBe('Fallback');
  });
});

describe('getFieldErrors', () => {
  it('maps details entries that carry a field', () => {
    const err = new ApiError(422, 'Validation failed', 'VALIDATION_ERROR', [
      { field: 'email', message: 'Invalid email' },
      { field: 'phone', message: 'Invalid AU phone' },
      { message: 'row-level problem' },
    ]);
    expect(getFieldErrors(err)).toEqual({
      email: 'Invalid email',
      phone: 'Invalid AU phone',
    });
  });

  it('returns an empty object for string details or no details', () => {
    expect(getFieldErrors(new ApiError(422, 'x', 'VALIDATION_ERROR', ['broken row']))).toEqual({});
    expect(getFieldErrors(new ApiError(404, 'x'))).toEqual({});
    expect(getFieldErrors(new TypeError('Failed to fetch'))).toEqual({});
  });

  it('maps details straight from an envelope object', () => {
    expect(
      getFieldErrors({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ field: 'scheduledDate', message: 'Date is in the past' }],
        },
      }),
    ).toEqual({ scheduledDate: 'Date is in the past' });
  });
});

describe('isNetworkError', () => {
  it('is true for status-0 ApiErrors and NETWORK_ERROR codes', () => {
    expect(isNetworkError(new ApiError(0, 'offline'))).toBe(true);
    expect(isNetworkError(new ApiError(0, 'offline', 'NETWORK_ERROR'))).toBe(true);
  });

  it('is true for raw fetch TypeErrors', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('is false for regular API errors and unknown values', () => {
    expect(isNetworkError(new ApiError(500, 'boom'))).toBe(false);
    expect(isNetworkError(new Error('nope'))).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});
