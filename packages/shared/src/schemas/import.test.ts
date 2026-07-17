import { describe, it, expect } from 'vitest';
import { geocodeVerificationSchema, importStatusResponseSchema } from './import';

describe('importStatusResponseSchema', () => {
  it('accepts valid import status response', () => {
    const result = importStatusResponseSchema.safeParse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      status: 'COMPLETED',
      totalRows: 50,
      successCount: 48,
      errorCount: 2,
      errors: [
        { row: 5, field: 'email', message: 'Invalid email format' },
        { row: 12, field: 'postcode', message: 'Required field' },
      ],
      createdAt: '2026-03-18T10:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts response without errors array', () => {
    const result = importStatusResponseSchema.safeParse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      status: 'PROCESSING',
      totalRows: 100,
      successCount: 0,
      errorCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = importStatusResponseSchema.safeParse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      status: 'INVALID',
      totalRows: 0,
      successCount: 0,
      errorCount: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('geocodeVerificationSchema', () => {
  it('accepts found with coordinates', () => {
    const result = geocodeVerificationSchema.safeParse({ status: 'found', lat: -33.86, lng: 151.2 });
    expect(result.success).toBe(true);
  });

  it('accepts not_found and unverified with null coordinates', () => {
    expect(geocodeVerificationSchema.safeParse({ status: 'not_found', lat: null, lng: null }).success).toBe(true);
    expect(geocodeVerificationSchema.safeParse({ status: 'unverified', lat: null, lng: null }).success).toBe(true);
  });

  it('rejects unknown status values', () => {
    const result = geocodeVerificationSchema.safeParse({ status: 'pending', lat: null, lng: null });
    expect(result.success).toBe(false);
  });
});
