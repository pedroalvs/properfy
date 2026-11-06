import type { LiveDayLastKnownSource } from '@properfy/shared';
import type { LiveDayStopRow } from './live-day.read-repository';

/** Configured-origin inputs for the fallback (never `LAST_STOP` coordinates as a base). */
export interface LastKnownOriginInput {
  originSource: string | null; // DayPlanOriginSource or null (no plan)
  originLat: number | null;
  originLng: number | null;
  originOverrideLat: number | null;
  originOverrideLng: number | null;
  baseLat: number | null;
  baseLng: number | null;
}

export interface LastKnownPoint {
  source: LiveDayLastKnownSource;
  lat: number | null;
  lng: number | null;
  at: string | null; // ISO instant; null for BASE/NONE
  appointmentId: string | null;
  label: string | null;
}

function base(lat: number | null, lng: number | null, label: string): LastKnownPoint {
  return { source: 'BASE', lat, lng, at: null, appointmentId: null, label };
}
const NONE: LastKnownPoint = { source: 'NONE', lat: null, lng: null, at: null, appointmentId: null, label: null };

/**
 * Last known point (D1, §4). The pin is the most recent check-in/check-out of a
 * non-abandoned execution; on an instant tie the check-in wins. With no event it
 * falls back to the configured origin (plan BASE/OVERRIDE, else profile base),
 * never to a `LAST_STOP` property coordinate (L-F04-07).
 */
export function resolveLastKnownPoint(
  rows: LiveDayStopRow[],
  origin: LastKnownOriginInput,
): LastKnownPoint {
  interface Candidate {
    source: 'CHECK_IN' | 'CHECK_OUT';
    at: Date;
    lat: number | null;
    lng: number | null;
    appointmentId: string;
  }
  const candidates: Candidate[] = [];
  for (const r of rows) {
    if (r.abandonedAt) continue;
    if (r.startedAt) {
      candidates.push({
        source: 'CHECK_IN',
        at: new Date(r.startedAt),
        lat: r.startLat,
        lng: r.startLng,
        appointmentId: r.appointmentId,
      });
    }
    if (r.finishedAt) {
      candidates.push({
        source: 'CHECK_OUT',
        at: new Date(r.finishedAt),
        lat: r.finishLat ?? r.startLat,
        lng: r.finishLng ?? r.startLng,
        appointmentId: r.appointmentId,
      });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const byTime = b.at.getTime() - a.at.getTime();
      if (byTime !== 0) return byTime;
      // Tie: check-in wins.
      if (a.source === 'CHECK_IN' && b.source !== 'CHECK_IN') return -1;
      if (b.source === 'CHECK_IN' && a.source !== 'CHECK_IN') return 1;
      return 0;
    });
    const top = candidates[0]!;
    return {
      source: top.source,
      lat: top.lat,
      lng: top.lng,
      at: top.at.toISOString(),
      appointmentId: top.appointmentId,
      label: null,
    };
  }

  switch (origin.originSource) {
    case 'BASE':
      return base(origin.originLat, origin.originLng, 'Base');
    case 'OVERRIDE':
      return base(origin.originLat, origin.originLng, 'Start of day');
    case 'LAST_STOP':
      if (origin.originOverrideLat !== null && origin.originOverrideLng !== null) {
        return base(origin.originOverrideLat, origin.originOverrideLng, 'Start of day');
      }
      if (origin.baseLat !== null && origin.baseLng !== null) {
        return base(origin.baseLat, origin.baseLng, 'Base');
      }
      return NONE;
    default:
      // No plan, or origin_source NONE: fall back to the profile base.
      if (origin.baseLat !== null && origin.baseLng !== null) {
        return base(origin.baseLat, origin.baseLng, 'Base');
      }
      return NONE;
  }
}
