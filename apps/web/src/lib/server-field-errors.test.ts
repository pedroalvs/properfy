import { describe, it, expect } from 'vitest';
import { mapServerFieldErrors, identityFieldMapper } from './server-field-errors';

function validationEnvelope(details: Array<{ field?: string; message: string }>) {
  return { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details } };
}

describe('mapServerFieldErrors', () => {
  const mapper = identityFieldMapper(['street', 'suburb'] as const);

  it('maps details with matching fields to fieldErrors and omits the summary error', () => {
    const result = mapServerFieldErrors(
      validationEnvelope([
        { field: 'street', message: 'Street is required' },
        { field: 'suburb', message: 'Suburb is required' },
      ]),
      mapper,
      'Request failed',
    );
    expect(result.fieldErrors).toEqual({
      street: 'Street is required',
      suburb: 'Suburb is required',
    });
    expect(result.error).toBeUndefined();
  });

  it('keeps the summary error when some details have no matching form field', () => {
    const result = mapServerFieldErrors(
      validationEnvelope([
        { field: 'street', message: 'Street is required' },
        { field: 'geo.latitude', message: 'Invalid latitude' },
      ]),
      mapper,
      'Request failed',
    );
    expect(result.fieldErrors).toEqual({ street: 'Street is required' });
    expect(result.error).toBe('Validation failed');
  });

  it('returns only the summary error when no detail matches', () => {
    const result = mapServerFieldErrors(
      validationEnvelope([{ field: 'unknownField', message: 'Nope' }]),
      mapper,
      'Request failed',
    );
    expect(result.fieldErrors).toBeUndefined();
    expect(result.error).toBe('Validation failed');
  });

  it('returns the backend message when the error carries no details', () => {
    const result = mapServerFieldErrors(
      { error: { code: 'CONFLICT', message: 'Already exists' } },
      mapper,
      'Request failed',
    );
    expect(result.fieldErrors).toBeUndefined();
    expect(result.error).toBe('Already exists');
  });

  it('falls back to the caller message for unparseable errors', () => {
    const result = mapServerFieldErrors({}, mapper, 'Request failed');
    expect(result.fieldErrors).toBeUndefined();
    expect(result.error).toBe('Request failed');
  });

  it('supports custom path mapping for dotted Zod paths', () => {
    const result = mapServerFieldErrors(
      validationEnvelope([{ field: 'contact.rentalTenantName', message: 'Name is required' }]),
      (path) => (path === 'contact.rentalTenantName' ? 'contactName' : undefined),
      'Request failed',
    );
    expect(result.fieldErrors).toEqual({ contactName: 'Name is required' });
    expect(result.error).toBeUndefined();
  });
});

describe('identityFieldMapper', () => {
  it('returns the path itself only when it names a known form field', () => {
    const mapper = identityFieldMapper(['name', 'legalName'] as const);
    expect(mapper('name')).toBe('name');
    expect(mapper('settings.emailSendingEnabled')).toBeUndefined();
  });
});
