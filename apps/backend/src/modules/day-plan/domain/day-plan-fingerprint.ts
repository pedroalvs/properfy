import { createHash } from 'node:crypto';
import type { DayPlanOriginSource } from '@properfy/shared';

/**
 * Input to the day-plan input fingerprint (L-F04-16). Prisma-free and reusable
 * by F05 (the test reads the source and fails on a Prisma-client import).
 *
 * The fingerprint is a sha256 of the plan's INPUTS, recomputed on every read so
 * that: (a) edits that emit no domain event still invalidate the plan, and (b)
 * execution changes that do not affect the route — a check-out, a
 * `SCHEDULED→DONE` of an already-started stop — leave the hash unchanged and
 * cost no Mapbox call (L-F04-01). Execution state is therefore collapsed to the
 * binary `NOT_STARTED`/`STARTED` (D18); abandonment returns a stop to
 * `NOT_STARTED`.
 */
export interface FingerprintOrigin {
  /** The CONFIGURED origin (override → base → none); never `LAST_STOP` (L-F04-07). */
  source: DayPlanOriginSource;
  lat: number | null;
  lng: number | null;
}

export interface FingerprintStop {
  appointmentId: string;
  /** Civil date `YYYY-MM-DD`. */
  scheduledDate: string;
  /** Agency wall-clock window, e.g. `08:00` / `17:00`. */
  timeSlotStart: string;
  timeSlotEnd: string;
  tenantTimezone: string;
  durationMinutes: number;
  lat: number | null;
  lng: number | null;
  startedAt: Date | null;
  abandonedAt: Date | null;
}

export interface FingerprintInput {
  origin: FingerprintOrigin;
  stops: FingerprintStop[];
}

/** Round to the 7 decimals stored as `Decimal(10,7)` so float noise never shifts the hash. */
function roundCoord(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1e7) / 1e7;
}

function execState(stop: FingerprintStop): 'NOT_STARTED' | 'STARTED' {
  return stop.startedAt !== null && stop.abandonedAt === null ? 'STARTED' : 'NOT_STARTED';
}

export function computeDayPlanFingerprint(input: FingerprintInput): string {
  const canonical = {
    origin: {
      source: input.origin.source,
      lat: roundCoord(input.origin.lat),
      lng: roundCoord(input.origin.lng),
    },
    stops: [...input.stops]
      .sort((a, b) => (a.appointmentId < b.appointmentId ? -1 : a.appointmentId > b.appointmentId ? 1 : 0))
      .map((s) => [
        s.appointmentId,
        s.scheduledDate,
        s.timeSlotStart,
        s.timeSlotEnd,
        s.tenantTimezone,
        s.durationMinutes,
        roundCoord(s.lat),
        roundCoord(s.lng),
        execState(s),
      ]),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
