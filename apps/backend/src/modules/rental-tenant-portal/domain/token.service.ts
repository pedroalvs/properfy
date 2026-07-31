import crypto from 'node:crypto';

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TOKEN_LENGTH = 10;
// 256 is not a multiple of 62, so bytes >= 248 are discarded. Without this the
// first 8 symbols would get 5 draws out of 256 instead of 4 — a 25% bias that
// keeps the token the right shape while quietly costing entropy.
const REJECTION_CEILING = 256 - (256 % TOKEN_ALPHABET.length);

export class TokenService {
  /**
   * Base62, 10 characters: 62^10 ≈ 8.4e17 (~59.5 bits). Short enough to send by
   * SMS, and paired with the portal's 30 req/min per-IP rate limit it leaves
   * brute force out of reach.
   *
   * Legacy 64-char hex tokens stay valid: lookup hashes whatever raw string
   * arrives, so nothing here constrains what an existing link may look like.
   */
  generateRawToken(): string {
    let token = '';
    while (token.length < TOKEN_LENGTH) {
      for (const byte of crypto.randomBytes(TOKEN_LENGTH)) {
        if (byte >= REJECTION_CEILING) continue;
        token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length];
        if (token.length === TOKEN_LENGTH) break;
      }
    }
    return token;
  }

  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  computeExpiresAt(
    scheduledDate: string,
    timezone: string,
    cutoffHour: number = 19,
    daysBefore: number = 1,
  ): Date {
    // scheduledDate is YYYY-MM-DD format
    // Returns cutoffHour on the day (scheduledDate - daysBefore) in the given timezone, converted to UTC.
    // Uses a two-pass approach to handle DST boundaries correctly.
    const dateParts = scheduledDate.split('-').map(Number);
    const year = dateParts[0]!;
    const month = dateParts[1]!;
    const day = dateParts[2]!;

    // Compute the target day using Date to handle month/year boundaries correctly
    const targetDayLocal = new Date(Date.UTC(year, month - 1, day - daysBefore, 12, 0, 0));
    const tdYear = targetDayLocal.getUTCFullYear();
    const tdMonth = targetDayLocal.getUTCMonth(); // 0-indexed
    const tdDay = targetDayLocal.getUTCDate();

    const formatter = new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      // h23, not hour12:false — some ICU versions map hour12:false to the h24
      // cycle, formatting local midnight as hour "24" with the day already
      // advanced, which corrupts the offset measured at exactly-midnight
      // instants (the end-of-day expiry).
      hourCycle: 'h23',
    });

    // Measure the UTC offset at a given instant by comparing the UTC hour
    // to the local hour in the target timezone.
    const measureOffset = (utcDate: Date): number => {
      const parts = formatter.formatToParts(utcDate);
      const localHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
      const localDay = Number(parts.find((p) => p.type === 'day')?.value ?? String(utcDate.getUTCDate()));

      let dayDiff = 0;
      const utcDay = utcDate.getUTCDate();
      if (localDay !== utcDay) {
        dayDiff = localDay > utcDay || localDay === 1 ? 1 : -1;
        if (utcDay === 1 && localDay >= 28) {
          dayDiff = -1;
        }
      }

      const localTotalHour = dayDiff * 24 + localHour;
      return localTotalHour - utcDate.getUTCHours();
    };

    // Pass 1: guess using offset measured at cutoffHour UTC on the target day
    const guessUtc = new Date(Date.UTC(tdYear, tdMonth, tdDay, cutoffHour, 0, 0));
    const offset1 = measureOffset(guessUtc);
    const candidate = new Date(Date.UTC(tdYear, tdMonth, tdDay, cutoffHour - offset1, 0, 0));

    // Pass 2: re-measure offset at the candidate time itself. If a DST transition
    // falls between the guess and the candidate, the offset may differ.
    const offset2 = measureOffset(candidate);
    if (offset2 !== offset1) {
      return new Date(Date.UTC(tdYear, tdMonth, tdDay, cutoffHour - offset2, 0, 0));
    }

    return candidate;
  }
}
