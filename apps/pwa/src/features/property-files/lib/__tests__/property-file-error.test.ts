import { describe, it, expect } from 'vitest';
import { ApiError, FILE_STORAGE_UNAVAILABLE_MESSAGE, NETWORK_ERROR_STATUS } from '@properfy/shared';
import { propertyFileErrorMessage } from '../property-file-error';

describe('propertyFileErrorMessage', () => {
  it('maps 503 to the shared storage-unavailable message (D16/FR-012)', () => {
    expect(propertyFileErrorMessage(new ApiError(503, 'x', 'FILE_STORAGE_UNAVAILABLE'))).toBe(
      FILE_STORAGE_UNAVAILABLE_MESSAGE,
    );
  });

  it('maps 404 to a not-available message without revealing existence (C.A2)', () => {
    expect(propertyFileErrorMessage(new ApiError(404, 'Not found', 'PROPERTY_FILE_NOT_FOUND'))).toMatch(
      /no longer available/i,
    );
  });

  it('maps a 409 photo-link conflict to a retry message', () => {
    expect(propertyFileErrorMessage(new ApiError(409, 'link failed', 'PROPERTY_ISSUE_PHOTO_LINK'))).toMatch(
      /couldn.t be attached/i,
    );
  });

  it('surfaces the server message for a 400 bad type/size (C.A5)', () => {
    expect(
      propertyFileErrorMessage(new ApiError(400, 'That file type is not allowed.', 'INVALID_FILE_TYPE')),
    ).toBe('That file type is not allowed.');
  });

  it('gives a generic retry message for a 5xx (no internals)', () => {
    expect(propertyFileErrorMessage(new ApiError(500, 'stack trace', 'INTERNAL_ERROR'))).toMatch(/try again/i);
  });

  it('gives an offline/connect message for a network error', () => {
    expect(propertyFileErrorMessage(new ApiError(NETWORK_ERROR_STATUS, 'net', 'NETWORK_ERROR'))).toMatch(
      /offline|connect/i,
    );
  });
});
