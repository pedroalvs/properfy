import { formatWallTime, TENANT_ETA_BAND_HALF_WIDTH_MINUTES } from '@properfy/shared';

/**
 * ETA band computation for tenant arrival notices (F06 §B, Achado 1).
 *
 * The estimate is shown as a ±30-minute range, lower-clipped to the booked
 * window start and to "now", and upper-clipped to the window end ONLY while the
 * rounded centre is still inside the window — a running-late prediction is past
 * the window end, so clipping its top would show a time that will not happen.
 *
 * All arithmetic is in integer epoch seconds (DST-safe); formatting uses the
 * stop's agency timezone. Australian offsets are 30-minute multiples, so
 * rounding the absolute instant to 5 minutes coincides with local rounding.
 */

const FIVE_MIN_S = 300;
const H_S = TENANT_ETA_BAND_HALF_WIDTH_MINUTES * 60;

const epochS = (d: Date): number => Math.floor(d.getTime() / 1000);
const fromEpochS = (s: number): Date => new Date(s * 1000);

/** Nearest multiple of 5 minutes, half rounding up. */
export function roundToFiveMinutes(at: Date): Date {
  return fromEpochS(Math.round(epochS(at) / FIVE_MIN_S) * FIVE_MIN_S);
}

/** Smallest multiple of 5 minutes ≥ the instant. */
export function ceilToFiveMinutes(at: Date): Date {
  return fromEpochS(Math.ceil(epochS(at) / FIVE_MIN_S) * FIVE_MIN_S);
}

export interface EtaBandWindow {
  windowStartAt: Date;
  windowEndAt: Date;
}

export interface EtaBand {
  from: Date;
  to: Date;
}

export function computeEtaBand(startAt: Date, window: EtaBandWindow, now: Date): EtaBand {
  const c = Math.round(epochS(startAt) / FIVE_MIN_S) * FIVE_MIN_S;
  const windowStartS = epochS(window.windowStartAt);
  const windowEndS = epochS(window.windowEndAt);
  const nowCeilS = Math.ceil(epochS(now) / FIVE_MIN_S) * FIVE_MIN_S;

  let fromS = Math.max(c - H_S, windowStartS, nowCeilS);
  let toS = c <= windowEndS ? Math.min(c + H_S, windowEndS) : c + H_S;

  if (fromS > toS) {
    // Degenerate: now is past the window end with the centre still inside it.
    fromS = nowCeilS;
    toS = fromS + H_S;
  }

  return { from: fromEpochS(fromS), to: fromEpochS(toS) };
}

/** 'HH:mm' wall time of an instant in a timezone (24h, never '24:00'). */
export function wallTimeHHmm(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/** Format a band as GSM-7 `'h:mm am'` strings in the stop's agency timezone. */
export function formatEtaBand(band: EtaBand, timezone: string): { from: string; to: string } {
  return {
    from: formatWallTime(wallTimeHHmm(band.from, timezone)),
    to: formatWallTime(wallTimeHHmm(band.to, timezone)),
  };
}
