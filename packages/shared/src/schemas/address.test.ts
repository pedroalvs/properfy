import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { addressSuggestionQuerySchema, branchAddressSchema } from './address';

describe('addressSuggestionQuerySchema', () => {
  it('accepts query without country filter', () => {
    const result = addressSuggestionQuerySchema.safeParse({
      q: '12 Harbour Street',
      limit: 5,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country).toBeUndefined();
    }
  });

  it('accepts single country code', () => {
    const result = addressSuggestionQuerySchema.safeParse({
      q: '12 Harbour Street',
      country: 'AU',
    });

    expect(result.success).toBe(true);
  });

  it('accepts comma separated country codes', () => {
    const result = addressSuggestionQuerySchema.safeParse({
      q: '12 Harbour Street',
      country: 'AU,NZ,US',
    });

    expect(result.success).toBe(true);
  });
});

describe('branchAddressSchema (permanent geocoding)', () => {
  const valid = {
    street: '1 Main St',
    suburb: 'Parramatta',
    city: 'Sydney',
    state: 'NSW',
    postcode: '2150',
    country: 'AU',
  };

  it('strips client-supplied latitude/longitude (no 400)', () => {
    const result = branchAddressSchema.safeParse({ ...valid, latitude: 1, longitude: 2 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('latitude' in result.data).toBe(false);
      expect('longitude' in result.data).toBe(false);
    }
  });

  it('stays a plain z.object so F01 can derive it with .extend (dec. 24)', () => {
    expect(branchAddressSchema instanceof z.ZodObject).toBe(true);
    const extended = branchAddressSchema.extend({ extra: z.string() });
    const result = extended.safeParse({ ...valid, extra: 'x' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.extra).toBe('x');
  });
});
