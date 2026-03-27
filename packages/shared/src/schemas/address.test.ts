import { describe, it, expect } from 'vitest';
import { addressSuggestionQuerySchema } from './address';

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
