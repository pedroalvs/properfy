import { describe, it, expect } from 'vitest';
import { auPhoneSchema } from './phone';

describe('auPhoneSchema', () => {
  it('accepts local mobile and transforms to E.164', () => {
    expect(auPhoneSchema.parse('0412345678')).toBe('+61412345678');
  });

  it('accepts masked local mobile and transforms to E.164', () => {
    expect(auPhoneSchema.parse('0412 345 678')).toBe('+61412345678');
  });

  it('accepts local landline and transforms to E.164', () => {
    expect(auPhoneSchema.parse('02 1234 5678')).toBe('+61212345678');
  });

  it('passes through canonical E.164 unchanged', () => {
    expect(auPhoneSchema.parse('+61412345678')).toBe('+61412345678');
  });

  it('accepts masked international format', () => {
    expect(auPhoneSchema.parse('+61 412 345 678')).toBe('+61412345678');
  });

  it('rejects too-short input', () => {
    expect(auPhoneSchema.safeParse('1234').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(auPhoneSchema.safeParse('').success).toBe(false);
  });

  it('rejects non-AU international numbers', () => {
    expect(auPhoneSchema.safeParse('+1 555 1234567').success).toBe(false);
  });

  it('rejects unallocated AU prefixes', () => {
    expect(auPhoneSchema.safeParse('0512345678').success).toBe(false);
    expect(auPhoneSchema.safeParse('+61912345678').success).toBe(false);
  });

  it('rejects alphabetic input', () => {
    expect(auPhoneSchema.safeParse('mobile').success).toBe(false);
  });

  it('rejects input longer than 30 chars', () => {
    expect(auPhoneSchema.safeParse('+61 412 345 678 000 000 000 000 000'.padEnd(31, '0')).success).toBe(false);
  });

  it('reports a clear error message', () => {
    const result = auPhoneSchema.safeParse('123');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Must be a valid Australian phone number');
    }
  });

  it('composes with optional/nullable without transforming null/undefined', () => {
    const optional = auPhoneSchema.optional().nullable();
    expect(optional.parse(undefined)).toBeUndefined();
    expect(optional.parse(null)).toBeNull();
    expect(optional.parse('0412345678')).toBe('+61412345678');
  });
});
