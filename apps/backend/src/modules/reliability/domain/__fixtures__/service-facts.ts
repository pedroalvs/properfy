import { zonedWallTimeToUtc } from '@properfy/shared';
import type { ServiceFact } from '../service-fact';

const TZ = 'Australia/Sydney';
const DEFAULT_SERVICE_DATE = '2026-11-10';

/** Agency wall-clock time on `date` as a UTC instant (TZ-independent — safe under TZ=America/Los_Angeles). */
export function wallAt(date: string, time: string): Date {
  return zonedWallTimeToUtc(date, time, TZ);
}

/**
 * A coherent, passing EXECUTED fact (checked in 09:30 inside a 09:00–11:00 slot,
 * within radius, under 6 h, no survey, no late notice). Override any field for a
 * specific case. Matches the TASK-F07-1 `buildFact` defaults.
 */
export function buildFact(overrides: Partial<ServiceFact> = {}): ServiceFact {
  const serviceDate = overrides.serviceDate ?? DEFAULT_SERVICE_DATE;
  const base: ServiceFact = {
    inspectorId: 'insp-1',
    appointmentId: '00000000-0000-0000-0000-000000000001',
    tenantId: 'tenant-1',
    timezone: TZ,
    kind: 'EXECUTED',
    origin: 'CURRENT_DONE',
    serviceDate,
    doneRejected: false,
    lateRejection: false,
    durationMinutes: 60,
    plannedTravelMinutes: 0,
    windowStartAt: wallAt(serviceDate, '09:00'),
    windowEndAt: wallAt(serviceDate, '11:00'),
    startedAt: wallAt(serviceDate, '09:30'),
    startClientAt: null,
    finishedAt: wallAt(serviceDate, '10:30'),
    resumedAt: null,
    outOfWindow: false,
    publishedEtaAt: null,
    publishedServiceStartAt: null,
    outOfRadius: false,
    finishOutOfRadius: false,
    geolocationDistanceMeters: 50,
    finishGeolocationDistanceMeters: 50,
    startAccuracyM: 20,
    finishAccuracyM: 20,
    geofenceRadiusM: 300,
    rating: null,
    lateNotices: [],
    cantAttendNoticeAt: null,
    inspectorCreatedOn: '2026-01-01',
  };
  return { ...base, ...overrides };
}
