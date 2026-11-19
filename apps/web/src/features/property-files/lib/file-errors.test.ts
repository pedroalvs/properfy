import { describe, it, expect } from 'vitest';
import { FILE_STORAGE_UNAVAILABLE_MESSAGE } from '@properfy/shared';
import { ApiError } from '@/lib/api-error';
import { isStorageUnavailable, resolveFileErrorMessage } from './file-errors';

describe('file-errors', () => {
  it('detects storage-unavailable by status and code', () => {
    expect(isStorageUnavailable(new ApiError(503, 'x', 'ANYTHING'))).toBe(true);
    expect(isStorageUnavailable(new ApiError(500, 'x', 'STORAGE_NOT_CONFIGURED'))).toBe(true);
    expect(isStorageUnavailable(new ApiError(400, 'x', 'VALIDATION_ERROR'))).toBe(false);
  });

  it('maps storage-unavailable to the shared message', () => {
    expect(resolveFileErrorMessage(new ApiError(503, 'raw', 'STORAGE_NOT_CONFIGURED'))).toBe(
      FILE_STORAGE_UNAVAILABLE_MESSAGE,
    );
  });

  it('uses the api error message otherwise', () => {
    expect(resolveFileErrorMessage(new ApiError(400, 'Bad file type', 'VALIDATION_ERROR'))).toBe(
      'Bad file type',
    );
  });

  it('falls back for a non-api error', () => {
    expect(resolveFileErrorMessage(new Error(''), 'Fallback')).toBe('Fallback');
  });
});
