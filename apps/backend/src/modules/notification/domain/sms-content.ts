/**
 * SMS content preparation for the send path. The encoding detection and length
 * limits live in `@properfy/shared` so the web template editor counts length with
 * the exact same rules; this module keeps the delivery-only concern (truncation)
 * and re-exports the shared helpers so the notification module has one SMS-content
 * entry point.
 */
import {
  isGsm7,
  gsm7SeptetLength,
  isGsm7ExtensionChar,
  SMS_MAX_CHARS_GSM7,
  SMS_MAX_CHARS_UCS2,
} from '@properfy/shared';

export {
  isGsm7,
  gsm7SeptetLength,
  measureSms,
  measureSmsTemplate,
  describeSmsOverLimit,
  SMS_MAX_CHARS_GSM7,
  SMS_MAX_CHARS_UCS2,
  type SmsEncoding,
  type SmsMeasurement,
  type SmsTemplateMeasurement,
} from '@properfy/shared';

export interface PreparedSmsBody {
  body: string;
  unicode: boolean;
  truncated: boolean;
}

function truncateGsm7(text: string, maxSeptets: number): string {
  let septets = 0;
  let end = 0;
  for (const char of text) {
    const cost = isGsm7ExtensionChar(char) ? 2 : 1;
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
