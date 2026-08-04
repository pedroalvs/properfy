import { z } from 'zod';

let canonicalZones: ReadonlySet<string> | null | undefined;

/**
 * Canonical IANA zone identifiers from the runtime's tzdb. `null` when the
 * runtime lacks Intl.supportedValuesOf (older engines) — validation then falls
 * back to the DateTimeFormat constructor probe.
 */
function supportedZones(): ReadonlySet<string> | null {
  if (canonicalZones === undefined) {
    try {
      canonicalZones = new Set(Intl.supportedValuesOf('timeZone'));
    } catch {
      canonicalZones = null;
    }
  }
  return canonicalZones;
}

/**
 * True when the value is an IANA timezone identifier (or 'UTC').
 *
 * Membership in Intl.supportedValuesOf is the primary check. Zones missing
 * from that list are still accepted when the DateTimeFormat constructor takes
 * them AND they are Region/City-shaped: the canonical list varies by ICU
 * version (e.g. some engines list Asia/Calcutta but not Asia/Kolkata), while
 * the '/' requirement keeps legacy abbreviations ('EST') and raw offsets
 * ('GMT+10') out. 'UTC' is allowed explicitly: some engines omit it from the
 * canonical list.
 */
export function isValidIanaTimezone(timezone: string): boolean {
  if (!timezone || timezone.length > 60) return false;
  if (timezone === 'UTC') return true;
  if (supportedZones()?.has(timezone)) return true;
  if (!timezone.includes('/')) return false;
  // The constructor is case-insensitive; require IANA casing (each segment
  // capitalized) so 'australia/sydney' is not stored as a distinct value.
  if (!timezone.split('/').every((segment) => /^[A-Z]/.test(segment))) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export const ianaTimezoneSchema = z
  .string()
  .min(1)
  .max(60)
  .refine(isValidIanaTimezone, { message: 'Must be a valid IANA timezone identifier' });
