import crypto from 'node:crypto';

export class TokenService {
  generateRawToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  computeExpiresAt(scheduledDate: string, timezone: string): Date {
    // scheduledDate is YYYY-MM-DD format
    // Returns 7PM on the day before in the given timezone, converted to UTC
    const [year, month, day] = scheduledDate.split('-').map(Number);

    // Compute the day before using Date to handle month/year boundaries correctly
    const dayBeforeLocal = new Date(Date.UTC(year, month - 1, day - 1, 12, 0, 0));
    const dbYear = dayBeforeLocal.getUTCFullYear();
    const dbMonth = dayBeforeLocal.getUTCMonth(); // 0-indexed
    const dbDay = dayBeforeLocal.getUTCDate();

    // Strategy: guess 19:00 UTC on day-before, then measure the offset
    // between UTC and the target timezone at that instant, and adjust.
    const guessUtc = new Date(Date.UTC(dbYear, dbMonth, dbDay, 19, 0, 0));

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(guessUtc);
    const localHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '19');
    const localDay = Number(parts.find((p) => p.type === 'day')?.value ?? String(dbDay));

    // Determine how many days the local representation differs from the target day
    let dayDiff = 0;
    if (localDay !== dbDay) {
      // The local date rolled forward or backward relative to the UTC date
      dayDiff = localDay > dbDay || localDay === 1 ? 1 : -1;
      // Edge case: if dbDay is 1 and localDay is 28-31, local rolled backward
      if (dbDay === 1 && localDay >= 28) {
        dayDiff = -1;
      }
    }

    const localTotalHour = dayDiff * 24 + localHour;
    const offsetHours = localTotalHour - 19;

    // To get 19:00 local, we need (19 - offset):00 UTC
    const expiresAtUtc = new Date(Date.UTC(dbYear, dbMonth, dbDay, 19 - offsetHours, 0, 0));

    return expiresAtUtc;
  }
}
