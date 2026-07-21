import { describe, expect, it } from 'vitest';
import {
  DomainError,
  UnprocessableEntityError,
  ValidationError,
} from '../../../src/shared/domain/errors';

describe('ValidationError', () => {
  it('defaults to VALIDATION_ERROR code with status 400', () => {
    const err = new ValidationError('bad input');

    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('bad input');
    expect(err.name).toBe('ValidationError');
    expect(err.details).toBeUndefined();
  });

  it('carries details with the default code', () => {
    const details = [{ field: 'email', message: 'Invalid email' }];
    const err = new ValidationError('bad input', details);

    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toBe(details);
  });

  it('accepts a semantic code as third parameter, keeping status 400', () => {
    const details = [{ field: 'key', message: 'Invalid key' }];
    const err = new ValidationError('bad key', details, 'SOME_SEMANTIC_CODE');

    expect(err.code).toBe('SOME_SEMANTIC_CODE');
    expect(err.statusCode).toBe(400);
    expect(err.details).toBe(details);
    expect(err.name).toBe('ValidationError');
    expect(err).toBeInstanceOf(ValidationError);
  });
});

describe('UnprocessableEntityError', () => {
  it('defaults to UNPROCESSABLE_ENTITY code with status 422', () => {
    const err = new UnprocessableEntityError('semantically rejected');

    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('UNPROCESSABLE_ENTITY');
    expect(err.statusCode).toBe(422);
    expect(err.name).toBe('UnprocessableEntityError');
  });

  it('accepts a semantic code as third parameter, keeping status 422', () => {
    const err = new UnprocessableEntityError('rejected', { reason: 'x' }, 'SOME_422_CODE');

    expect(err.code).toBe('SOME_422_CODE');
    expect(err.statusCode).toBe(422);
    expect(err.details).toEqual({ reason: 'x' });
    expect(err).toBeInstanceOf(UnprocessableEntityError);
  });
});
