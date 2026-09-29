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
 * Minimum run of digits before a term is treated as a phone number worth
 * expanding. Above AU postcodes (4 digits) so a short numeric term (a postcode,
 * an appointment number) does not leak into the phone clause.
 */
const MIN_PHONE_SEARCH_DIGITS = 6;

/**
 * A term is a phone candidate only if it is digits plus phone punctuation —
 * no letters. This keeps a general search term ("apt 123456 Smith St", used by
 * the appointments list `search` field alongside notes/address/name) from
 * having its scattered digits concatenated into a stray phone fragment.
 */
const PHONE_SHAPED = /^[+()\d\s.\-]+$/;

/**
 * Expands a user-typed phone search term into every form that could match a
 * stored value. Stored phones are canonical E.164 (`+61...`), so a local/spaced
 * input has to be reduced to matchable variants before a raw `contains` finds
 * it. Returns `[]` for anything that is not a phone-shaped term of at least
 * MIN_PHONE_SEARCH_DIGITS digits — so callers can safely skip the phone clause
 * and keep their name/email/address clauses (no false positives, no regression
 * for a plain name or a short postcode).
 */
export function phoneSearchVariants(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed || !PHONE_SHAPED.test(trimmed)) return [];

  const digits = trimmed.replace(/\D/g, '');
  const e164 = toE164Au(trimmed);
  // Expand only a full AU number (e164 resolves) or a long-enough digit run.
  // A short pure-digit term (a 4-digit postcode like "0800") resolves to
  // neither and yields nothing.
  if (!e164 && digits.length < MIN_PHONE_SEARCH_DIGITS) return [];

  const variants = new Set<string>();
  // Keep the literal typed term so legacy, non-canonical stored values
  // (e.g. a phone saved as "0412 345 678") still match by substring as before.
  variants.add(trimmed);

  if (e164) {
    variants.add(e164); // +61412345678 — matches current canonical data
    variants.add(`0${e164.slice(3)}`); // 0412345678 — legacy local form
  }

  // Partial / free-form: match on digits alone. Drop the trunk 0 / country code
  // so the remaining run is a substring of the stored +61XXXXXXXXX. Both the
  // full digit run and the stripped national run must be >= MIN so a 5-digit
  // fragment (which matches far too many stored numbers) is never emitted.
  if (digits.length >= MIN_PHONE_SEARCH_DIGITS) {
    variants.add(digits);
    const national = digits.replace(/^(?:61|0)/, '');
    if (national.length >= MIN_PHONE_SEARCH_DIGITS) variants.add(national);
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
