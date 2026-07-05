/**
 * SMS content rules per the Mobile Message API: a message may span at most
 * 10 SMS parts — 1,530 characters in GSM-7 encoding or 670 in UCS-2.
 */
export const SMS_MAX_CHARS_GSM7 = 1530;
export const SMS_MAX_CHARS_UCS2 = 670;

// GSM 03.38 basic charset + extension table characters.
const GSM7_CHARS =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà' +
  '^{}\\[~]|€';
const GSM7_SET = new Set(GSM7_CHARS);

export function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!GSM7_SET.has(char)) return false;
  }
  return true;
}

export interface PreparedSmsBody {
  body: string;
  unicode: boolean;
  truncated: boolean;
}

/**
 * Applies encoding detection and the provider's hard length limit.
 * Over-limit bodies are truncated (a partial notification beats a rejected one).
 */
export function prepareSmsBody(text: string): PreparedSmsBody {
  const unicode = !isGsm7(text);
  const maxChars = unicode ? SMS_MAX_CHARS_UCS2 : SMS_MAX_CHARS_GSM7;
  if (text.length <= maxChars) {
    return { body: text, unicode, truncated: false };
  }
  return { body: text.slice(0, maxChars), unicode, truncated: true };
}
