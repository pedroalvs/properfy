export const AU_E164_REGEX = /^\+61[23478]\d{8}$/;

export function isE164Au(s: string): boolean {
  return AU_E164_REGEX.test(s);
}

/**
 * Converts a masked, local (0-prefixed) or international AU phone number to
 * canonical E.164 (+61...). Returns null if the input cannot be converted.
 */
export function toE164Au(value: string): string | null {
  if (!value) return null;

  const startsWithPlus = value.trim().startsWith('+');
  const digits = value.replace(/\D/g, '');

  let e164: string;
  if (startsWithPlus) {
    e164 = `+${digits}`;
  } else if (digits.startsWith('0') && digits.length === 10) {
    e164 = `+61${digits.slice(1)}`;
  } else {
    return null;
  }

  return AU_E164_REGEX.test(e164) ? e164 : null;
}
