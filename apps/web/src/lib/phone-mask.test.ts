import { describe, it, expect } from 'vitest';
import { applyPhoneMask, stripNonDigits, toE164Au } from './phone-mask';

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

describe('toE164Au', () => {
  it('converts local mobile 0412 345 678 to +61412345678', () => {
    expect(toE164Au('0412 345 678')).toBe('+61412345678');
  });

  it('converts unmasked local mobile 0412345678 to +61412345678', () => {
    expect(toE164Au('0412345678')).toBe('+61412345678');
  });

  it('converts local landline 02 1234 5678 to +61212345678', () => {
    expect(toE164Au('02 1234 5678')).toBe('+61212345678');
  });

  it('converts masked intl +61 412 345 678 to +61412345678', () => {
    expect(toE164Au('+61 412 345 678')).toBe('+61412345678');
  });

  it('passes through already-canonical +61412345678 unchanged', () => {
    expect(toE164Au('+61412345678')).toBe('+61412345678');
  });

  it('returns null for too-short input', () => {
    expect(toE164Au('1234')).toBeNull();
  });

  it('returns null for non-AU international (+1 555 1234567)', () => {
    expect(toE164Au('+1 555 1234567')).toBeNull();
  });

  it('returns null for +610 (invalid AU prefix)', () => {
    expect(toE164Au('0012345678')).toBeNull();
  });

  it('returns null for alphabetic input', () => {
    expect(toE164Au('abc')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(toE164Au('')).toBeNull();
  });

  it('returns null for local 05xx (unallocated AU prefix)', () => {
    expect(toE164Au('0512345678')).toBeNull();
  });

  it('returns null for local 06xx (unallocated AU prefix)', () => {
    expect(toE164Au('0612345678')).toBeNull();
  });

  it('returns null for local 09xx (unallocated AU prefix)', () => {
    expect(toE164Au('0912345678')).toBeNull();
  });

  it('returns null for +615 (unallocated E.164 AU prefix)', () => {
    expect(toE164Au('+61512345678')).toBeNull();
  });

  it('returns null for +616 (unallocated E.164 AU prefix)', () => {
    expect(toE164Au('+61612345678')).toBeNull();
  });

  it('returns null for +619 (unallocated E.164 AU prefix)', () => {
    expect(toE164Au('+61912345678')).toBeNull();
  });
});
