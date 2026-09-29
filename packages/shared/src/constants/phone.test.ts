import { describe, it, expect } from 'vitest';
import {
  applyPhoneMask,
  stripNonDigits,
  maxPhoneDigits,
  formatAuPhone,
  phoneSearchVariants,
} from './phone';

describe('applyPhoneMask', () => {
  it('formats Australian mobile numbers', () => {
    expect(applyPhoneMask('0412345678')).toBe('0412 345 678');
    expect(applyPhoneMask('0412')).toBe('0412');
    expect(applyPhoneMask('0412345')).toBe('0412 345');
  });

  it('formats Australian landline numbers', () => {
    expect(applyPhoneMask('0212345678')).toBe('02 1234 5678');
  });

  it('formats international +61 numbers', () => {
    expect(applyPhoneMask('+61412345678')).toBe('+61 412 345 678');
    expect(applyPhoneMask('+61')).toBe('+61');
  });

  it('returns empty for empty input', () => {
    expect(applyPhoneMask('')).toBe('');
  });

  it('handles partial input', () => {
    expect(applyPhoneMask('04')).toBe('04');
    expect(applyPhoneMask('041')).toBe('041');
  });
});

describe('stripNonDigits', () => {
  it('removes non-digit characters', () => {
    expect(stripNonDigits('0412 345 678')).toBe('0412345678');
  });

  it('preserves leading +', () => {
    expect(stripNonDigits('+61 412 345 678')).toBe('+61412345678');
  });
});

describe('maxPhoneDigits', () => {
  it('allows 10 digits for local numbers', () => {
    expect(maxPhoneDigits('0412345678')).toBe(10);
  });

  it('allows 11 digits for international numbers', () => {
    expect(maxPhoneDigits('+61412345678')).toBe(11);
  });
});

describe('formatAuPhone', () => {
  it('formats E.164 mobile to local display', () => {
    expect(formatAuPhone('+61412345678')).toBe('0412 345 678');
  });

  it('formats E.164 landline to local display', () => {
    expect(formatAuPhone('+61212345678')).toBe('02 1234 5678');
  });

  it('formats unmasked local mobile', () => {
    expect(formatAuPhone('0412345678')).toBe('0412 345 678');
  });

  it('keeps already-masked local format stable (idempotent)', () => {
    expect(formatAuPhone('0412 345 678')).toBe('0412 345 678');
    expect(formatAuPhone(formatAuPhone('+61412345678'))).toBe('0412 345 678');
  });

  it('returns non-convertible legacy values unchanged', () => {
    expect(formatAuPhone('12345')).toBe('12345');
    expect(formatAuPhone('+1 555 1234567')).toBe('+1 555 1234567');
  });

  it('returns empty string for empty input', () => {
    expect(formatAuPhone('')).toBe('');
  });
});

describe('phoneSearchVariants', () => {
  // Stored phones are canonical E.164 (+61412345678). Every variant returned
  // here must be a substring of that stored form so a raw `contains` matches.
  const stored = '+61412345678';
  const matchesStored = (term: string) =>
    phoneSearchVariants(term).some((v) => stored.includes(v));

  it('matches a full local number typed with spaces', () => {
    expect(phoneSearchVariants('0412 345 678')).toContain('+61412345678');
    expect(matchesStored('0412 345 678')).toBe(true);
  });

  it('matches a full local number without spaces', () => {
    expect(phoneSearchVariants('0412345678')).toContain('+61412345678');
    expect(matchesStored('0412345678')).toBe(true);
  });

  it('matches an E.164 number typed with spaces', () => {
    expect(phoneSearchVariants('+61 412 345 678')).toContain('+61412345678');
    expect(matchesStored('+61 412 345 678')).toBe(true);
  });

  it('includes the legacy local (0-prefixed) form for a full number', () => {
    expect(phoneSearchVariants('0412345678')).toContain('0412345678');
  });

  it('matches a longer partial national fragment', () => {
    expect(matchesStored('412345')).toBe(true);
    expect(matchesStored('345678')).toBe(true);
  });

  it('matches a long fragment that includes the country code', () => {
    expect(matchesStored('614123')).toBe(true);
  });

  it('preserves the literal typed term so legacy non-canonical stored values still match', () => {
    // A phone saved before canonicalization (e.g. "0412 345 678") is matched by
    // a substring `contains` on the raw term, which must remain a variant.
    expect(phoneSearchVariants('0412 345 678')).toContain('0412 345 678');
  });

  it('returns an empty array for text containing letters (not phone-shaped)', () => {
    expect(phoneSearchVariants('Jane Smith')).toEqual([]);
    expect(phoneSearchVariants('')).toEqual([]);
    expect(phoneSearchVariants('   ')).toEqual([]);
    // A general search term whose scattered digits must NOT become a phone
    // fragment (the appointments `search` box also matches notes/address).
    expect(phoneSearchVariants('apt 123456 Smith St')).toEqual([]);
  });

  it('does not expand a short numeric term into loose fragments', () => {
    // A 4-digit AU postcode must not leak into the phone clause.
    expect(phoneSearchVariants('0800')).toEqual([]);
    expect(phoneSearchVariants('2217')).toEqual([]);
    expect(phoneSearchVariants('04')).toEqual([]);
  });

  it('never emits a national fragment shorter than the minimum', () => {
    // "012345" -> national "12345" (5 digits) is too short and would match far
    // too many stored numbers, so only the full 6-digit run is kept.
    const variants = phoneSearchVariants('012345');
    expect(variants).toContain('012345');
    expect(variants).not.toContain('12345');
  });

  it('returns distinct variants', () => {
    const variants = phoneSearchVariants('0412345678');
    expect(new Set(variants).size).toBe(variants.length);
  });
});
