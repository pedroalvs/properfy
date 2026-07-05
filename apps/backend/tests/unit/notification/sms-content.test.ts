import { describe, it, expect } from 'vitest';
import {
  isGsm7,
  prepareSmsBody,
  SMS_MAX_CHARS_GSM7,
  SMS_MAX_CHARS_UCS2,
} from '../../../src/modules/notification/domain/sms-content';

describe('isGsm7', () => {
  it('accepts plain ASCII text and common GSM symbols', () => {
    expect(isGsm7('Hello! Your inspection is at 10:30 on 12/07. Reply STOP to opt out @properfy #1 (unit 2) $50 & more?')).toBe(true);
  });

  it('accepts GSM extension characters', () => {
    expect(isGsm7('Cost: 50€ [unit] {2} ~ok | \\')).toBe(true);
  });

  it('rejects accented and emoji characters', () => {
    expect(isGsm7('olá')).toBe(false);
    expect(isGsm7('done ✓')).toBe(false);
  });
});

describe('prepareSmsBody', () => {
  it('leaves short GSM-7 bodies untouched', () => {
    const result = prepareSmsBody('Your inspection is confirmed.');
    expect(result).toEqual({ body: 'Your inspection is confirmed.', unicode: false, truncated: false });
  });

  it('flags unicode bodies', () => {
    const result = prepareSmsBody('Inspeção confirmada');
    expect(result.unicode).toBe(true);
    expect(result.truncated).toBe(false);
  });

  it('truncates GSM-7 bodies above the 10-part limit', () => {
    const long = 'a'.repeat(SMS_MAX_CHARS_GSM7 + 100);
    const result = prepareSmsBody(long);
    expect(result.body.length).toBe(SMS_MAX_CHARS_GSM7);
    expect(result.truncated).toBe(true);
    expect(result.unicode).toBe(false);
  });

  it('truncates unicode bodies at the UCS-2 limit', () => {
    const long = 'á'.repeat(SMS_MAX_CHARS_UCS2 + 50);
    const result = prepareSmsBody(long);
    expect(result.body.length).toBe(SMS_MAX_CHARS_UCS2);
    expect(result.truncated).toBe(true);
    expect(result.unicode).toBe(true);
  });
});
