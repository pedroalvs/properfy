import type { LiveDayAlert, LiveDayInspectorState } from '@properfy/shared';
import {
  FIELD_ISSUE_REASON_LABELS,
  LATE_NOTICE_REASON_LABELS,
  LIVE_DAY_ALERT_TYPE_ORDER,
  COMPLETION_REMINDER_DEDUPE_PREFIX,
} from '@properfy/shared';
import { AppointmentCodeFormatter } from '../../appointment/domain/appointment-code.formatter';
import { computeEstimatedArrivalAt } from '../../inspector-execution/domain/late-notice';
import type {
  LiveDayEventRow,
  LiveDayReminderRow,
  LiveDayStopRow,
} from './live-day.read-repository';
import { baselineInstant, execClassOf, windowEndInstant, windowStartInstant } from './stop-view';
import type { EffectiveThresholds } from './resolve-effective-thresholds';

export interface DeriveAlertsInput {
  visible: LiveDayStopRow[];
  events: LiveDayEventRow[];
  reminders: LiveDayReminderRow[];
  now: Date;
  isPastDay: boolean;
  state: LiveDayInspectorState;
  delayMinutes: number | null;
  thresholds: EffectiveThresholds;
  /** Current `fieldEvents.checkInWindowToleranceMinutes` (for the OUT_OF_WINDOW threshold). */
  checkInWindowTolerance: number;
}

type AlertDraft = Partial<LiveDayAlert> & Pick<LiveDayAlert, 'type' | 'occurredAt'>;

/** Fill the unused alert fields with null so every alert matches the wire schema. */
function alert(draft: AlertDraft): LiveDayAlert {
  return {
    appointmentId: null,
    appointmentCode: null,
    minutes: null,
    estimatedArrivalAt: null,
    thresholdMinutes: null,
    thresholdSource: null,
    reason: null,
    reasonLabel: null,
    note: null,
    phase: null,
    distanceMeters: null,
    radiusMeters: null,
    ...draft,
  };
}

const iso = (d: Date): string => d.toISOString();
const code = (s: { appointmentNumber: number; appointmentCodePrefix: string | null }): string =>
  AppointmentCodeFormatter.formatParts(s.appointmentNumber, s.appointmentCodePrefix);

/** Round a `Decimal(10,2)` distance to whole metres for the wire (int). */
const metres = (v: number | null): number | null => (v === null ? null : Math.round(v));

/**
 * The seven Live Day alert types (§5, 01.11/01.A5). Pure over the T-1-visible rows,
 * the inspector's field events + completion-reminder notices, and the effective
 * thresholds. No acknowledge/dismiss (L-F05-01): each type has an explicit exit
 * rule. Infeasibility is NOT here — it is the `routeFeasible`/`routeViolations`
 * indicator (D20, L-F04-05). The list is sorted by `LIVE_DAY_ALERT_TYPE_ORDER`,
 * then `occurredAt` descending within a type.
 */
export function deriveAlerts(input: DeriveAlertsInput): LiveDayAlert[] {
  const { visible, events, reminders, now, isPastDay, state, delayMinutes, thresholds } = input;
  const cls = execClassOf(visible);
  const byAppt = new Map(visible.map((s) => [s.appointmentId, s] as const));
  const alerts: LiveDayAlert[] = [];

  // ── DELAY (one per inspector, from the accumulated delay) ────────────────────
  if (delayMinutes !== null && delayMinutes > thresholds.delayMinutes) {
    const delayShown = isPastDay
      ? true // a past day's delay is a fact in any state
      : state === 'AT_PROPERTY' || state === 'IN_TRANSIT';
    if (delayShown) {
      const latestStarted = [...visible]
        .filter((s) => s.startedAt !== null && s.abandonedAt === null)
        .sort((a, b) => new Date(b.startedAt as string).getTime() - new Date(a.startedAt as string).getTime())[0];
      if (latestStarted) {
        alerts.push(
          alert({
            type: 'DELAY',
            occurredAt: latestStarted.startedAt as string,
            appointmentId: latestStarted.appointmentId,
            minutes: delayMinutes,
            thresholdMinutes: thresholds.delayMinutes,
            thresholdSource: thresholds.delaySource,
          }),
        );
      }
    }
  }

  // ── NOT_STARTED (per not-started visible stop) ───────────────────────────────
  for (const stop of visible) {
    if (cls.get(stop.appointmentId) !== 'NOT_STARTED') continue;
    const baseline = baselineInstant(stop);
    const effectiveNow = isPastDay ? windowEndInstant(stop) : now;
    const minutes = Math.floor((effectiveNow.getTime() - baseline.getTime()) / 60_000);
    if (minutes > thresholds.notStartedMinutes) {
      alerts.push(
        alert({
          type: 'NOT_STARTED',
          occurredAt: iso(new Date(baseline.getTime() + thresholds.notStartedMinutes * 60_000)),
          appointmentId: stop.appointmentId,
          appointmentCode: code(stop),
          minutes,
          thresholdMinutes: thresholds.notStartedMinutes,
          thresholdSource: thresholds.notStartedSource,
        }),
      );
    }
  }

  // ── LATE_NOTICE (latest per not-started visible stop) ────────────────────────
  const latestLate = new Map<string, LiveDayEventRow>();
  for (const e of events) {
    if (e.type !== 'LATE_NOTICE') continue;
    const prev = latestLate.get(e.appointmentId);
    if (!prev || new Date(e.createdAt).getTime() > new Date(prev.createdAt).getTime()) {
      latestLate.set(e.appointmentId, e);
    }
  }
  for (const e of latestLate.values()) {
    const stop = byAppt.get(e.appointmentId);
    if (!stop || cls.get(e.appointmentId) !== 'NOT_STARTED') continue; // exits on check-in / leaving the roster
    const reference = windowStartInstant(stop);
    const effectiveNoticeAt = e.clientOccurredAt !== null ? new Date(e.clientOccurredAt) : new Date(e.createdAt);
    const estimatedArrivalAt =
      e.minutes !== null ? computeEstimatedArrivalAt(reference, effectiveNoticeAt, e.minutes) : null;
    alerts.push(
      alert({
        type: 'LATE_NOTICE',
        occurredAt: e.createdAt,
        appointmentId: e.appointmentId,
        appointmentCode: code(stop),
        minutes: e.minutes,
        estimatedArrivalAt: estimatedArrivalAt === null ? null : iso(estimatedArrivalAt),
        reason: e.reasonCode,
        reasonLabel: e.reasonCode ? LATE_NOTICE_REASON_LABELS[e.reasonCode as keyof typeof LATE_NOTICE_REASON_LABELS] ?? null : null,
      }),
    );
  }

  // ── CANT_DO (per active event; the appointment is NOT re-offered or reassigned) ─
  for (const e of events) {
    if (e.type !== 'CANT_DO' || !e.cantDoActive) continue;
    alerts.push(
      alert({
        type: 'CANT_DO',
        occurredAt: e.createdAt,
        appointmentId: e.appointmentId,
        appointmentCode: AppointmentCodeFormatter.formatParts(e.appointmentNumber, e.appointmentCodePrefix),
        reason: e.reasonCode,
        reasonLabel: e.reasonCode ? FIELD_ISSUE_REASON_LABELS[e.reasonCode as keyof typeof FIELD_ISSUE_REASON_LABELS] ?? null : null,
        note: e.note,
      }),
    );
  }

  // ── GEOFENCE (non-abandoned execution of a visible stop; START and/or FINISH) ─
  for (const stop of visible) {
    if (stop.abandonedAt !== null || stop.startedAt === null) continue;
    const finished = cls.get(stop.appointmentId) === 'FINISHED';
    // START exits once the stop is FINISHED; FINISH is born at check-out and stays.
    if (stop.outOfRadius === true && !finished) {
      alerts.push(
        alert({
          type: 'GEOFENCE',
          occurredAt: stop.startedAt,
          appointmentId: stop.appointmentId,
          appointmentCode: code(stop),
          phase: 'START',
          distanceMeters: metres(stop.geolocationDistanceMeters),
          radiusMeters: stop.geofenceRadiusM,
        }),
      );
    }
    if (stop.finishOutOfRadius === true && stop.finishedAt !== null) {
      alerts.push(
        alert({
          type: 'GEOFENCE',
          occurredAt: stop.finishedAt,
          appointmentId: stop.appointmentId,
          appointmentCode: code(stop),
          phase: 'FINISH',
          distanceMeters: metres(stop.finishGeolocationDistanceMeters),
          radiusMeters: stop.geofenceRadiusM,
        }),
      );
    }
  }

  // ── OUT_OF_WINDOW (non-abandoned execution, F03 flag, until FINISHED) ─────────
  for (const stop of visible) {
    if (stop.abandonedAt !== null || stop.startedAt === null || stop.outOfWindow !== true) continue;
    if (cls.get(stop.appointmentId) === 'FINISHED') continue; // exits on check-out
    const minutes = minutesOutsideWindow(new Date(stop.startedAt), stop);
    const overTolerance = minutes > input.checkInWindowTolerance;
    alerts.push(
      alert({
        type: 'OUT_OF_WINDOW',
        occurredAt: stop.startedAt,
        appointmentId: stop.appointmentId,
        appointmentCode: code(stop),
        minutes,
        thresholdMinutes: overTolerance ? input.checkInWindowTolerance : null,
        thresholdSource: overTolerance ? 'PLATFORM' : null,
      }),
    );
  }

  // ── COMPLETION_REMINDER (a sent reminder whose stop is not FINISHED) ──────────
  for (const reminder of reminders) {
    const appointmentId = appointmentIdFromDedupeKey(reminder.dedupeKey);
    if (appointmentId === null) continue;
    const stop = byAppt.get(appointmentId);
    if (!stop || cls.get(appointmentId) === 'FINISHED') continue; // exits on check-out
    alerts.push(
      alert({
        type: 'COMPLETION_REMINDER',
        occurredAt: reminder.createdAt,
        appointmentId,
        appointmentCode: code(stop),
      }),
    );
  }

  return sortAlerts(alerts);
}

/** Minutes between a check-in and the nearest edge of the booked window (0 when inside, L-F05-11). */
function minutesOutsideWindow(startedAt: Date, stop: LiveDayStopRow): number {
  const start = windowStartInstant(stop).getTime();
  const end = windowEndInstant(stop).getTime();
  const t = startedAt.getTime();
  if (t < start) return Math.floor((start - t) / 60_000);
  if (t > end) return Math.floor((t - end) / 60_000);
  return 0;
}

/** `completion-reminder:{appointmentId}:{date}:{inspectorId}` → appointmentId (UUID, no colons). */
function appointmentIdFromDedupeKey(dedupeKey: string): string | null {
  const parts = dedupeKey.split(':');
  return parts.length >= 4 && parts[0] === COMPLETION_REMINDER_DEDUPE_PREFIX ? parts[1]! : null;
}

function sortAlerts(alerts: LiveDayAlert[]): LiveDayAlert[] {
  const rank = new Map(LIVE_DAY_ALERT_TYPE_ORDER.map((t, i) => [t, i] as const));
  return [...alerts].sort((a, b) => {
    const byType = (rank.get(a.type) ?? 99) - (rank.get(b.type) ?? 99);
    if (byType !== 0) return byType;
    return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
  });
}
