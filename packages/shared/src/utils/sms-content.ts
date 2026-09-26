/**
 * SMS content measurement, shared by the backend send path and the web template
 * editor so both count length with identical rules.
 *
 * Limits per the Mobile Message API: a message spans at most 10 SMS parts.
 * GSM-7 packs 153 septets per concatenated part (160 in a lone single part);
 * UCS-2 packs 67 UTF-16 units per part (70 in a lone part). The two max
 * constants are derived from those so the "10 parts" contract is enforced, not
 * restated.
 */
export const SMS_MAX_PARTS = 10;
export const SMS_GSM7_SINGLE_PART = 160;
export const SMS_GSM7_MULTI_PART = 153;
export const SMS_UCS2_SINGLE_PART = 70;
export const SMS_UCS2_MULTI_PART = 67;
export const SMS_MAX_CHARS_GSM7 = SMS_MAX_PARTS * SMS_GSM7_MULTI_PART; // 1530
export const SMS_MAX_CHARS_UCS2 = SMS_MAX_PARTS * SMS_UCS2_MULTI_PART; // 670

// GSM 03.38 basic charset characters (1 septet each).
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
// GSM 03.38 extension table characters (escape-prefixed: 2 septets each).
const GSM7_EXTENSION = '^{}\\[~]|€';
const GSM7_BASIC_SET = new Set(GSM7_BASIC);
const GSM7_EXTENSION_SET = new Set(GSM7_EXTENSION);

/** True when the character is in the GSM-7 extension table (costs 2 septets). */
export function isGsm7ExtensionChar(char: string): boolean {
  return GSM7_EXTENSION_SET.has(char);
}

export function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!GSM7_BASIC_SET.has(char) && !GSM7_EXTENSION_SET.has(char)) return false;
  }
  return true;
}

/** Septet cost of a GSM-7 string (extension-table chars cost 2). */
export function gsm7SeptetLength(text: string): number {
  let septets = 0;
  for (const char of text) {
    septets += GSM7_EXTENSION_SET.has(char) ? 2 : 1;
  }
  return septets;
}

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export interface SmsMeasurement {
  /** Detected encoding of the text. */
  encoding: SmsEncoding;
  /** Septets (GSM-7) or UTF-16 units (UCS-2), matching how the send path truncates. */
  length: number;
  /** Provider hard limit for the detected encoding. */
  limit: number;
  /** Number of SMS parts the body would be split into. */
  parts: number;
  /** Whether the body exceeds the provider limit and would be truncated on send. */
  overLimit: boolean;
}

function partsFor(length: number, singlePart: number, multiPart: number): number {
  if (length === 0) return 0;
  if (length <= singlePart) return 1;
  return Math.ceil(length / multiPart);
}

/**
 * Measure a fully rendered SMS body. UCS-2 length is UTF-16 units (`text.length`),
 * mirroring the send-path truncation, so an emoji counts as 2 like it does there.
 */
export function measureSms(text: string): SmsMeasurement {
  if (!isGsm7(text)) {
    const length = text.length;
    return {
      encoding: 'UCS-2',
      length,
      limit: SMS_MAX_CHARS_UCS2,
      parts: partsFor(length, SMS_UCS2_SINGLE_PART, SMS_UCS2_MULTI_PART),
      overLimit: length > SMS_MAX_CHARS_UCS2,
    };
  }
  const length = gsm7SeptetLength(text);
  return {
    encoding: 'GSM-7',
    length,
    limit: SMS_MAX_CHARS_GSM7,
    parts: partsFor(length, SMS_GSM7_SINGLE_PART, SMS_GSM7_MULTI_PART),
    overLimit: length > SMS_MAX_CHARS_GSM7,
  };
}
