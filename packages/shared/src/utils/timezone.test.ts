import { describe, expect, it } from 'vitest';
import { ianaTimezoneSchema, isValidIanaTimezone } from './timezone';

describe('isValidIanaTimezone', () => {
  it.each([
    'Australia/Sydney',
    'Australia/Lord_Howe',
    'Pacific/Auckland',
    'America/Sao_Paulo',
    'Europe/London',
    'Asia/Kolkata',
    'UTC',
  ])('accepts canonical IANA zone %s', (tz) => {
    expect(isValidIanaTimezone(tz)).toBe(true);
  });

  it.each([
    ['EST', 'legacy abbreviation'],
    ['GMT+10', 'raw offset'],
    ['Sydney', 'bare city'],
    ['Australia/Springfield', 'nonexistent zone'],
    ['', 'empty string'],
    ['australia/sydney', 'wrong casing'],
  ])('rejects %s (%s)', (tz) => {
    expect(isValidIanaTimezone(tz)).toBe(false);
  });

  it('rejects values longer than 60 characters', () => {
    expect(isValidIanaTimezone(`Australia/${'a'.repeat(60)}`)).toBe(false);
  });
});

describe('ianaTimezoneSchema', () => {
  it('parses a valid zone', () => {
    expect(ianaTimezoneSchema.parse('Australia/Perth')).toBe('Australia/Perth');
  });

  it('rejects an invalid zone with a readable message', () => {
    const result = ianaTimezoneSchema.safeParse('Sydney');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/IANA timezone/);
    }
  });

  it('rejects empty strings', () => {
    expect(ianaTimezoneSchema.safeParse('').success).toBe(false);
  });
});
