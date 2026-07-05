import { describe, it, expect } from 'vitest';
import {
  isGsm7,
  gsm7SeptetLength,
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

  it('counts GSM-7 extension characters as 2 septets', () => {
    expect(gsm7SeptetLength('abc')).toBe(3);
    expect(gsm7SeptetLength('{}')).toBe(4);
    expect(gsm7SeptetLength('a€b')).toBe(4);
  });

  it('truncates extension-heavy GSM-7 bodies earlier than plain ASCII of the same length', () => {
    // 800 braces = 1600 septets > 1530 even though .length is only 800
    const heavy = '{'.repeat(800);
    const result = prepareSmsBody(heavy);
    expect(result.unicode).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBe(SMS_MAX_CHARS_GSM7 / 2);
    expect(gsm7SeptetLength(result.body)).toBeLessThanOrEqual(SMS_MAX_CHARS_GSM7);

    const plain = 'a'.repeat(800);
    expect(prepareSmsBody(plain).truncated).toBe(false);
  });

  it('never splits a surrogate pair when truncating UCS-2 bodies', () => {
    // 669 chars + emoji: slice(0, 670) would cut the emoji in half
    const text = 'a'.repeat(SMS_MAX_CHARS_UCS2 - 1) + '😀'.repeat(10);
    const result = prepareSmsBody(text);
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBe(SMS_MAX_CHARS_UCS2 - 1);
    const lastCode = result.body.charCodeAt(result.body.length - 1);
    expect(lastCode >= 0xd800 && lastCode <= 0xdbff).toBe(false);
  });
});
