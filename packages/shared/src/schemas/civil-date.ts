import { z } from 'zod';

/**
 * A civil calendar date (YYYY-MM-DD) with no timezone attached — the wire format
 * every date-bounded request in the API uses. Resolving it to an instant is the
 * backend's job (`parseDateInTimezone` against `PLATFORM_TIMEZONE`).
 *
 * The regex alone accepts impossible dates like `2026-02-31`, so the refine
 * round-trips the parts through `Date.UTC` and rejects anything the calendar
 * silently rolled over.
 */
export const civilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required')
  .refine((s) => {
    // The preceding regex guarantees exactly three numeric parts.
    const [y, mo, d] = s.split('-').map(Number) as [number, number, number];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }, 'Invalid calendar date');
