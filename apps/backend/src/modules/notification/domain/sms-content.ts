/**
 * SMS content rules per the Mobile Message API: a message may span at most
 * 10 SMS parts — 1,530 septets in GSM-7 encoding or 670 UCS-2 characters.
 */
export const SMS_MAX_CHARS_GSM7 = 1530;
export const SMS_MAX_CHARS_UCS2 = 670;

// GSM 03.38 basic charset characters (1 septet each).
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
// GSM 03.38 extension table characters (escape-prefixed: 2 septets each).
const GSM7_EXTENSION = '^{}\\[~]|€';
const GSM7_BASIC_SET = new Set(GSM7_BASIC);
const GSM7_EXTENSION_SET = new Set(GSM7_EXTENSION);

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

export interface PreparedSmsBody {
  body: string;
  unicode: boolean;
  truncated: boolean;
}

function truncateGsm7(text: string, maxSeptets: number): string {
  let septets = 0;
  let end = 0;
  for (const char of text) {
    const cost = GSM7_EXTENSION_SET.has(char) ? 2 : 1;
    if (septets + cost > maxSeptets) break;
    septets += cost;
    end += char.length;
  }
  return text.slice(0, end);
}

function truncateUcs2(text: string, maxChars: number): string {
  let body = text.slice(0, maxChars);
  // Never end on a dangling high surrogate (would mangle emoji/astral chars).
  const lastCode = body.charCodeAt(body.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    body = body.slice(0, -1);
  }
  return body;
}

/**
 * Applies encoding detection and the provider's hard length limit.
 * Over-limit bodies are truncated (a partial notification beats a rejected one).
 */
export function prepareSmsBody(text: string): PreparedSmsBody {
  const unicode = !isGsm7(text);

  if (unicode) {
    if (text.length <= SMS_MAX_CHARS_UCS2) {
      return { body: text, unicode, truncated: false };
    }
    return { body: truncateUcs2(text, SMS_MAX_CHARS_UCS2), unicode, truncated: true };
  }

  if (gsm7SeptetLength(text) <= SMS_MAX_CHARS_GSM7) {
    return { body: text, unicode, truncated: false };
  }
  return { body: truncateGsm7(text, SMS_MAX_CHARS_GSM7), unicode, truncated: true };
}
