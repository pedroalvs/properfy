import { toE164Au } from '@properfy/shared';

export { toE164Au };

/**
 * Australian phone mask utility.
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

