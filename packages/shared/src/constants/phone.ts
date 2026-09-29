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

/**
 * Minimum run of digits before a free-form term is expanded into loose phone
 * fragments. Above AU postcodes (4 digits) so a postcode search does not leak
 * into the phone clause.
 */
const MIN_PHONE_FRAGMENT_DIGITS = 6;

/**
 * Expands a user-typed phone search term into every canonical form that could
 * match a stored value. Stored phones are canonical E.164 (`+61...`), so a
 * local/spaced input has to be reduced to matchable variants before a raw
 * `contains` will find it. Returns `[]` for non-phone text (e.g. a name), so
 * callers can safely skip the phone clause and keep their name/email clauses.
 */
export function phoneSearchVariants(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return [];
  const variants = new Set<string>();

  // Full AU number in any format (local, spaced, +61) -> both canonical forms.
  const e164 = toE164Au(trimmed);
  if (e164) {
    variants.add(e164); // +61412345678 — matches current stored data
    variants.add(`0${e164.slice(3)}`); // 0412345678 — any legacy local data
  }

  // Partial / free-form: match on digits alone. Drop the trunk 0 / country
  // code so the remaining digits are a substring of the stored +61XXXXXXXXX.
  // Require a reasonably long run of digits (>= MIN_PHONE_FRAGMENT_DIGITS) so a
  // short numeric term — a 4-digit postcode like "0800", an appointment number —
  // does not turn into a stray fragment ("800") that matches unrelated phones in
  // a search OR that also spans address/postcode fields.
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= MIN_PHONE_FRAGMENT_DIGITS) {
    variants.add(digits);
    const national = digits.replace(/^(?:61|0)/, '');
    if (national.length >= MIN_PHONE_FRAGMENT_DIGITS - 1) variants.add(national);
  }

  return [...variants];
}

/**
 * Australian phone mask utilities.
 *
 * Formats digits into standard Australian patterns:
 *   Mobile:    0412 345 678  (04XX XXX XXX)
 *   Landline:  02 1234 5678  (0X XXXX XXXX)
 *   Intl:      +61 412 345 678
 *
 * For other formats, groups digits in blocks of 3-4 for readability.
 */

const DIGITS_ONLY = /\D/g;

export function stripNonDigits(value: string): string {
  const hasPlus = value.startsWith('+');
  const digits = value.replace(DIGITS_ONLY, '');
  return hasPlus ? `+${digits}` : digits;
}

export function applyPhoneMask(raw: string): string {
  if (!raw) return '';

  const startsWithPlus = raw.startsWith('+');
  const digits = raw.replace(DIGITS_ONLY, '');

  if (!digits) return startsWithPlus ? '+' : '';

  // International: +61 XXX XXX XXX
  if (startsWithPlus) {
    const cc = digits.slice(0, 2); // country code (61)
    const rest = digits.slice(2);
    if (!rest) return `+${cc}`;
    const g1 = rest.slice(0, 3);
    const g2 = rest.slice(3, 6);
    const g3 = rest.slice(6, 9);
    return `+${cc} ${g1}${g2 ? ` ${g2}` : ''}${g3 ? ` ${g3}` : ''}`;
  }

  // Mobile: 04XX XXX XXX
  if (digits.startsWith('04')) {
    const g1 = digits.slice(0, 4);
    const g2 = digits.slice(4, 7);
    const g3 = digits.slice(7, 10);
    return `${g1}${g2 ? ` ${g2}` : ''}${g3 ? ` ${g3}` : ''}`;
  }

  // Landline: 0X XXXX XXXX
  if (digits.startsWith('0') && digits.length > 1) {
    const ac = digits.slice(0, 2);
    const g1 = digits.slice(2, 6);
    const g2 = digits.slice(6, 10);
    return `${ac}${g1 ? ` ${g1}` : ''}${g2 ? ` ${g2}` : ''}`;
  }

  // Fallback: group in 4-3-3
  const g1 = digits.slice(0, 4);
  const g2 = digits.slice(4, 7);
  const g3 = digits.slice(7, 10);
  return `${g1}${g2 ? ` ${g2}` : ''}${g3 ? ` ${g3}` : ''}`;
}

/** Max digits allowed (AU numbers are 10 local or 11 with +61) */
export function maxPhoneDigits(raw: string): number {
  return raw.startsWith('+') ? 11 : 10;
}

/**
 * Formats any AU-convertible phone value (E.164 or local) for display in the
 * local masked format (0412 345 678). Non-convertible values (legacy data)
 * are returned unchanged.
 */
export function formatAuPhone(value: string): string {
  if (!value) return '';
  const e164 = toE164Au(value);
  if (!e164) return value;
  return applyPhoneMask(`0${e164.slice(3)}`);
}
