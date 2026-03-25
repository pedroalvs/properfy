import { describe, it, expect } from 'vitest';
import { applyPhoneMask, stripNonDigits } from './phone-mask';

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
