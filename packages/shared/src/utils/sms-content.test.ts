import { describe, it, expect } from 'vitest';
import {
  isGsm7,
  gsm7SeptetLength,
  isGsm7ExtensionChar,
  measureSms,
  SMS_MAX_CHARS_GSM7,
  SMS_MAX_CHARS_UCS2,
  SMS_MAX_PARTS,
  SMS_GSM7_MULTI_PART,
  SMS_UCS2_MULTI_PART,
} from './sms-content';

describe('SMS length constants', () => {
  it('derives the max chars from parts × per-part septets (Mobile Message: 10 parts)', () => {
    expect(SMS_MAX_CHARS_GSM7).toBe(SMS_MAX_PARTS * SMS_GSM7_MULTI_PART); // 1530
    expect(SMS_MAX_CHARS_UCS2).toBe(SMS_MAX_PARTS * SMS_UCS2_MULTI_PART); // 670
    expect(SMS_MAX_CHARS_GSM7).toBe(1530);
    expect(SMS_MAX_CHARS_UCS2).toBe(670);
  });
});

describe('isGsm7', () => {
  it('accepts plain GSM-7 text', () => {
    expect(isGsm7('Hi John, your inspection is on 15/04.')).toBe(true);
  });
  it('rejects text with characters outside the GSM-7 alphabet', () => {
    expect(isGsm7('café ☕')).toBe(false);
    expect(isGsm7('emoji 😀')).toBe(false);
  });
  it('accepts extension-table characters', () => {
    expect(isGsm7('price: €5 {code} [x]')).toBe(true);
  });
});

describe('gsm7SeptetLength', () => {
  it('counts basic characters as one septet each', () => {
    expect(gsm7SeptetLength('hello')).toBe(5);
  });
  it('counts extension-table characters as two septets each', () => {
    // '€' and the braces are extension chars (2 septets each).
    expect(gsm7SeptetLength('€')).toBe(2);
    expect(gsm7SeptetLength('{}')).toBe(4);
  });
});

describe('isGsm7ExtensionChar', () => {
  it('flags extension-table characters', () => {
    for (const c of ['^', '{', '}', '\\', '[', ']', '~', '|', '€']) {
      expect(isGsm7ExtensionChar(c)).toBe(true);
    }
  });
  it('does not flag basic characters', () => {
    for (const c of ['a', '1', ' ', '@']) expect(isGsm7ExtensionChar(c)).toBe(false);
  });
});

describe('measureSms', () => {
  it('reports 0 parts for an empty string', () => {
    expect(measureSms('')).toMatchObject({ length: 0, parts: 0, overLimit: false, encoding: 'GSM-7' });
  });

  it('measures GSM-7 single-part boundaries (160 → 1 part, 161 → 2)', () => {
    expect(measureSms('a'.repeat(160))).toMatchObject({ encoding: 'GSM-7', parts: 1, overLimit: false });
    expect(measureSms('a'.repeat(161))).toMatchObject({ encoding: 'GSM-7', parts: 2, overLimit: false });
  });

  it('measures GSM-7 multi-part boundaries (306 → 2 parts, 307 → 3)', () => {
    expect(measureSms('a'.repeat(306)).parts).toBe(2);
    expect(measureSms('a'.repeat(307)).parts).toBe(3);
  });

  it('accepts GSM-7 at the 1530 limit and rejects 1531', () => {
    const at = measureSms('a'.repeat(1530));
    expect(at).toMatchObject({ encoding: 'GSM-7', length: 1530, parts: 10, overLimit: false });
    expect(measureSms('a'.repeat(1531)).overLimit).toBe(true);
  });

  it('switches to UCS-2 for non-GSM text and measures 70 → 1, 71 → 2', () => {
    expect(measureSms('á'.repeat(70))).toMatchObject({ encoding: 'UCS-2', parts: 1, overLimit: false });
    expect(measureSms('á'.repeat(71))).toMatchObject({ encoding: 'UCS-2', parts: 2, overLimit: false });
  });

  it('accepts UCS-2 at the 670 limit and rejects 671', () => {
    expect(measureSms('á'.repeat(670))).toMatchObject({ encoding: 'UCS-2', length: 670, overLimit: false });
    expect(measureSms('á'.repeat(671)).overLimit).toBe(true);
  });

  it('counts extension-table characters as two septets when measuring GSM-7', () => {
    // 800 '{' → 1600 septets → over the 1530 GSM-7 limit despite only 800 chars.
    const m = measureSms('{'.repeat(800));
    expect(m.encoding).toBe('GSM-7');
    expect(m.length).toBe(1600);
    expect(m.overLimit).toBe(true);
  });
});
