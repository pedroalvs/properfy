import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  IReliabilityFactsReader,
  ReliabilityCantAttendRow,
  ReliabilityCivilRange,
  ReliabilityDoneRow,
  ReliabilityFactsRaw,
  ReliabilityLateNoticeRow,
  ReliabilityNoShowRow,
  ReliabilityPlanStopRow,
  ReliabilitySurveyRow,
} from '../domain/reliability-facts.reader';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Instant pre-filter bounds that cover any timezone (−12..+14) and DST for the civil range. */
function instantBounds(from: string, to: string): { fromLower: Date; toUpper: Date } {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return {
    fromLower: new Date(Date.UTC(fy!, fm! - 1, fd! - 1, 0, 0, 0)),
    toUpper: new Date(Date.UTC(ty!, tm! - 1, td! + 2, 0, 0, 0)),
  };
}

/**
 * Reliability facts reader (F07-1). Loads the full per-period universe in a fixed
 * seven queries (Q1a/Q1b current DONE, Q2 later-rejected DONE, Q3 CANT_ATTEND,
 * Q7 OP no-show, then Q4 plan stops, Q5 surveys, Q6 late-notices), independent of
 * the inspector count. No coordinate column is ever selected (D12); distances,
 * accuracies and the radius come back as `float8`/`int`, never `Decimal`.
 */
export class PrismaReliabilityFactsReader implements IReliabilityFactsReader {
  constructor(private readonly prisma: PrismaClient) {}

  load(range: ReliabilityCivilRange): Promise<ReliabilityFactsRaw> {
    return this.loadInternal(this.prisma, range);
  }

  loadWith(tx: Prisma.TransactionClient, range: ReliabilityCivilRange): Promise<ReliabilityFactsRaw> {
    return this.loadInternal(tx, range);
  }

  loadCompletedCounts(range: { from: string; to: string }): Promise<Map<string, number>> {
    return this.loadCompletedCountsInternal(this.prisma, range);
  }

  loadCompletedCountsWith(
    tx: Prisma.TransactionClient,
    range: { from: string; to: string },
  ): Promise<Map<string, number>> {
    return this.loadCompletedCountsInternal(tx, range);
  }

  private async loadInternal(db: DbClient, range: ReliabilityCivilRange): Promise<ReliabilityFactsRaw> {
    const { from, to, inspectorIds } = range;
    const { fromLower, toUpper } = instantBounds(from, to);

    const [done, cantAttend, noShow] = await Promise.all([
      this.loadDone(db, from, to, fromLower, toUpper, inspectorIds),
      this.loadCantAttend(db, from, to, fromLower, toUpper, inspectorIds),
      this.loadNoShow(db, from, to, fromLower, inspectorIds),
    ]);

    const appointmentIds = [
      ...new Set([
        ...done.map((r) => r.appointmentId),
        ...cantAttend.map((r) => r.appointmentId),
        ...noShow.map((r) => r.appointmentId),
      ]),
    ];

    if (appointmentIds.length === 0) {
      return { done, cantAttend, noShow, planStops: [], surveys: [], lateNotices: [] };
    }

    const [planStops, surveys, lateNotices] = await Promise.all([
      this.loadPlanStops(db, appointmentIds),
      this.loadSurveys(db, appointmentIds),
      this.loadLateNotices(db, appointmentIds),
    ]);

    return { done, cantAttend, noShow, planStops, surveys, lateNotices };
  }

  private inspectorFilter(column: Prisma.Sql, inspectorIds?: string[]): Prisma.Sql {
    return inspectorIds && inspectorIds.length > 0
      ? Prisma.sql`AND ${column} = ANY(${inspectorIds}::text[])`
      : Prisma.empty;
  }

  // Q1a (current DONE with own execution → EXECUTED) UNION ALL Q1b (DONE without own execution)
  private loadDone(
    db: DbClient,
    from: string,
    to: string,
    fromLower: Date,
    toUpper: Date,
    inspectorIds?: string[],
  ): Promise<ReliabilityDoneRow[]> {
    const filterQ1a = this.inspectorFilter(Prisma.sql`a.inspector_id`, inspectorIds);
    const filterQ2 = this.inspectorFilter(Prisma.sql`rel.released_inspector_id`, inspectorIds);

    return db.$queryRaw<ReliabilityDoneRow[]>(Prisma.sql`
      SELECT a.id AS "appointmentId", a.inspector_id AS "inspectorId", a.tenant_id AS "tenantId",
             'CURRENT_DONE' AS "origin", false AS "doneRejected", NULL::text AS "rejectedOn",
             to_char(a.scheduled_date, 'YYYY-MM-DD') AS "scheduledDate",
             a.time_slot_start AS "timeSlotStart", a.time_slot_end AS "timeSlotEnd",
             t.timezone AS "timezone", st.default_duration_minutes::int AS "defaultDurationMinutes",
             i.created_at AS "inspectorCreatedAt",
             to_char(((e.finished_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date, 'YYYY-MM-DD') AS "serviceDate",
             e.started_at AS "startedAt", e.start_client_at AS "startClientAt", e.finished_at AS "finishedAt",
             e.resumed_at AS "resumedAt", e.out_of_window AS "outOfWindow", e.out_of_radius AS "outOfRadius",
             e.finish_out_of_radius AS "finishOutOfRadius",
             e.geolocation_distance_meters::float8 AS "geolocationDistanceMeters",
             e.finish_geolocation_distance_meters::float8 AS "finishGeolocationDistanceMeters",
             e.start_accuracy_m::float8 AS "startAccuracyM", e.finish_accuracy_m::float8 AS "finishAccuracyM",
             e.geofence_radius_m::int AS "geofenceRadiusM"
      FROM inspection_executions e
      JOIN appointments a   ON a.id = e.appointment_id AND a.deleted_at IS NULL
                           AND a.status = 'DONE' AND a.inspector_id = e.inspector_id
      JOIN tenants t        ON t.id = a.tenant_id
      JOIN service_types st ON st.id = a.service_type_id
      JOIN inspectors i     ON i.id = a.inspector_id
      WHERE e.finished_at IS NOT NULL AND e.abandoned_at IS NULL
        AND e.finished_at >= ${fromLower} AND e.finished_at < ${toUpper}
        AND ((e.finished_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date BETWEEN ${from}::date AND ${to}::date
        ${filterQ1a}

      UNION ALL

      SELECT a.id, a.inspector_id, a.tenant_id, 'CURRENT_DONE', false, NULL::text,
             to_char(a.scheduled_date, 'YYYY-MM-DD'),
             a.time_slot_start, a.time_slot_end, t.timezone, st.default_duration_minutes::int,
             i.created_at,
             to_char(a.scheduled_date, 'YYYY-MM-DD'),
             NULL::timestamp, NULL::timestamp, NULL::timestamp, NULL::timestamp,
             NULL::boolean, NULL::boolean, NULL::boolean,
             NULL::float8, NULL::float8, NULL::float8, NULL::float8, NULL::int
      FROM appointments a
      JOIN tenants t        ON t.id = a.tenant_id
      JOIN service_types st ON st.id = a.service_type_id
      JOIN inspectors i     ON i.id = a.inspector_id
      WHERE a.deleted_at IS NULL AND a.status = 'DONE' AND a.inspector_id IS NOT NULL
        AND a.scheduled_date BETWEEN ${from}::date AND ${to}::date
        AND NOT EXISTS (
          SELECT 1 FROM inspection_executions e2
          WHERE e2.appointment_id = a.id AND e2.inspector_id = a.inspector_id AND e2.abandoned_at IS NULL
        )
        ${filterQ1a}

      UNION ALL

      -- Q2 · later-rejected DONE (one fact per done_rejected audit, NOT_EXECUTED only)
      SELECT a.id, rel.released_inspector_id, a.tenant_id, 'REJECTED_DONE', true,
             to_char(((al.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date, 'YYYY-MM-DD'),
             to_char(a.scheduled_date, 'YYYY-MM-DD'),
             a.time_slot_start, a.time_slot_end, t.timezone, st.default_duration_minutes::int,
             i.created_at,
             COALESCE(
               to_char(((e.finished_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date, 'YYYY-MM-DD'),
               to_char(((done_tr.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date, 'YYYY-MM-DD')
             ),
             e.started_at, e.start_client_at, e.finished_at, e.resumed_at,
             e.out_of_window, e.out_of_radius, e.finish_out_of_radius,
             e.geolocation_distance_meters::float8, e.finish_geolocation_distance_meters::float8,
             e.start_accuracy_m::float8, e.finish_accuracy_m::float8, e.geofence_radius_m::int
      FROM audit_logs al
      JOIN appointments a   ON a.id = al.entity_id AND a.deleted_at IS NULL
      JOIN tenants t        ON t.id = a.tenant_id
      JOIN service_types st ON st.id = a.service_type_id
      JOIN LATERAL (
        SELECT s.metadata_json->>'releasedInspectorId' AS released_inspector_id,
               s.metadata_json->>'rejectionReasonCode' AS rejection_code
        FROM audit_logs s
        WHERE s.entity_type = 'Appointment' AND s.entity_id = al.entity_id
          AND s.action = 'appointment.status_transition'
          AND s.before_json->>'status' = 'DONE' AND s.after_json->>'status' = 'REJECTED'
        ORDER BY abs(extract(epoch FROM s.created_at - al.created_at)) LIMIT 1
      ) rel ON rel.released_inspector_id IS NOT NULL AND rel.rejection_code = 'NOT_EXECUTED'
      JOIN inspectors i ON i.id = rel.released_inspector_id
      LEFT JOIN inspection_executions e
             ON e.appointment_id = a.id AND e.inspector_id = rel.released_inspector_id
            AND e.finished_at IS NOT NULL AND e.abandoned_at IS NULL
      LEFT JOIN LATERAL (
        SELECT d.created_at FROM audit_logs d
        WHERE d.entity_type = 'Appointment' AND d.entity_id = al.entity_id
          AND d.action = 'appointment.status_transition' AND d.after_json->>'status' = 'DONE'
          AND d.created_at <= al.created_at
        ORDER BY d.created_at DESC LIMIT 1
      ) done_tr ON true
      WHERE al.action = 'appointment.done_rejected' AND al.created_at >= ${fromLower}
        AND (
              COALESCE(((e.finished_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date,
                       ((done_tr.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date) BETWEEN ${from}::date AND ${to}::date
           OR (
                ((al.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date BETWEEN ${from}::date AND ${to}::date
            AND ((al.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date
                > COALESCE(((e.finished_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date,
                           ((done_tr.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date) + 30
              )
            )
        ${filterQ2}
    `);
  }

  // Q3 · CANT_ATTEND (most recent per inspector + appointment)
  private loadCantAttend(
    db: DbClient,
    from: string,
    to: string,
    fromLower: Date,
    toUpper: Date,
    inspectorIds?: string[],
  ): Promise<ReliabilityCantAttendRow[]> {
    const filter = this.inspectorFilter(Prisma.sql`fe.inspector_id`, inspectorIds);
    return db.$queryRaw<ReliabilityCantAttendRow[]>(Prisma.sql`
      SELECT DISTINCT ON (fe.inspector_id, fe.appointment_id)
             fe.inspector_id AS "inspectorId", fe.appointment_id AS "appointmentId", fe.tenant_id AS "tenantId",
             fe.created_at AS "createdAt", fe.client_occurred_at AS "clientOccurredAt",
             a.time_slot_start AS "timeSlotStart", a.time_slot_end AS "timeSlotEnd",
             to_char(a.scheduled_date, 'YYYY-MM-DD') AS "scheduledDate",
             t.timezone AS "timezone", st.default_duration_minutes::int AS "defaultDurationMinutes",
             i.created_at AS "inspectorCreatedAt",
             to_char(((fe.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date, 'YYYY-MM-DD') AS "serviceDate"
      FROM inspector_field_events fe
      JOIN appointments a   ON a.id = fe.appointment_id AND a.deleted_at IS NULL
      JOIN tenants t        ON t.id = fe.tenant_id
      JOIN service_types st ON st.id = a.service_type_id
      JOIN inspectors i     ON i.id = fe.inspector_id
      WHERE fe.type = 'CANT_DO' AND fe.reason_code = 'CANT_ATTEND'
        AND fe.created_at >= ${fromLower} AND fe.created_at < ${toUpper}
        AND ((fe.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date BETWEEN ${from}::date AND ${to}::date
        ${filter}
      ORDER BY fe.inspector_id, fe.appointment_id, fe.created_at DESC
    `);
  }

  // Q7 · OP-marked no-show (SCHEDULED → REJECTED with INSPECTOR_NO_SHOW)
  private loadNoShow(
    db: DbClient,
    from: string,
    to: string,
    fromLower: Date,
    inspectorIds?: string[],
  ): Promise<ReliabilityNoShowRow[]> {
    const filter = this.inspectorFilter(Prisma.sql`s.metadata_json->>'releasedInspectorId'`, inspectorIds);
    return db.$queryRaw<ReliabilityNoShowRow[]>(Prisma.sql`
      SELECT a.id AS "appointmentId", s.metadata_json->>'releasedInspectorId' AS "inspectorId", a.tenant_id AS "tenantId",
             to_char(a.scheduled_date, 'YYYY-MM-DD') AS "scheduledDate",
             a.time_slot_start AS "timeSlotStart", a.time_slot_end AS "timeSlotEnd",
             t.timezone AS "timezone", st.default_duration_minutes::int AS "defaultDurationMinutes",
             i.created_at AS "inspectorCreatedAt",
             to_char(a.scheduled_date, 'YYYY-MM-DD') AS "serviceDate"
      FROM audit_logs s
      JOIN appointments a   ON a.id = s.entity_id AND a.deleted_at IS NULL
      JOIN tenants t        ON t.id = a.tenant_id
      JOIN service_types st ON st.id = a.service_type_id
      JOIN inspectors i     ON i.id = s.metadata_json->>'releasedInspectorId'
      WHERE s.action = 'appointment.status_transition' AND s.entity_type = 'Appointment'
        AND s.created_at >= ${fromLower}
        AND s.before_json->>'status' = 'SCHEDULED' AND s.after_json->>'status' = 'REJECTED'
        AND s.metadata_json->>'rejectionReasonCode' = 'INSPECTOR_NO_SHOW'
        AND s.metadata_json->>'releasedInspectorId' IS NOT NULL
        AND a.scheduled_date BETWEEN ${from}::date AND ${to}::date
        ${filter}
    `);
  }

  // Q4 · plan stops (weight + published times)
  private loadPlanStops(db: DbClient, appointmentIds: string[]): Promise<ReliabilityPlanStopRow[]> {
    return db.$queryRaw<ReliabilityPlanStopRow[]>(Prisma.sql`
      SELECT s.appointment_id AS "appointmentId", p.inspector_id AS "inspectorId",
             to_char(p.plan_date, 'YYYY-MM-DD') AS "planDate",
             s.travel_s::int AS "travelSeconds", s.duration_minutes::int AS "durationMinutes",
             s.published_eta AS "publishedEta", s.published_service_start_at AS "publishedServiceStartAt"
      FROM day_plan_stops s
      JOIN day_plans p ON p.id = s.day_plan_id
      WHERE s.appointment_id = ANY(${appointmentIds}::text[])
    `);
  }

  // Q5 · satisfaction surveys
  private loadSurveys(db: DbClient, appointmentIds: string[]): Promise<ReliabilitySurveyRow[]> {
    return db.$queryRaw<ReliabilitySurveyRow[]>(Prisma.sql`
      SELECT appointment_id AS "appointmentId", inspector_id AS "inspectorId", rating::int AS "rating"
      FROM satisfaction_surveys
      WHERE appointment_id = ANY(${appointmentIds}::text[])
    `);
  }

  // Q6 · late-notice field events
  private loadLateNotices(db: DbClient, appointmentIds: string[]): Promise<ReliabilityLateNoticeRow[]> {
    return db.$queryRaw<ReliabilityLateNoticeRow[]>(Prisma.sql`
      SELECT appointment_id AS "appointmentId", inspector_id AS "inspectorId",
             created_at AS "createdAt", client_occurred_at AS "clientOccurredAt"
      FROM inspector_field_events
      WHERE type = 'LATE_NOTICE' AND appointment_id = ANY(${appointmentIds}::text[])
    `);
  }

  private async loadCompletedCountsInternal(
    db: DbClient,
    range: { from: string; to: string },
  ): Promise<Map<string, number>> {
    const { from, to } = range;
    const { fromLower, toUpper } = instantBounds(from, to);
    const rows = await db.$queryRaw<Array<{ inspectorId: string; count: number }>>(Prisma.sql`
      SELECT inspector_id AS "inspectorId", COUNT(*)::int AS "count"
      FROM (
        SELECT a.inspector_id
        FROM inspection_executions e
        JOIN appointments a ON a.id = e.appointment_id AND a.deleted_at IS NULL
                           AND a.status = 'DONE' AND a.inspector_id = e.inspector_id
        JOIN tenants t ON t.id = a.tenant_id
        WHERE e.finished_at IS NOT NULL AND e.abandoned_at IS NULL
          AND e.finished_at >= ${fromLower} AND e.finished_at < ${toUpper}
          AND ((e.finished_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date BETWEEN ${from}::date AND ${to}::date

        UNION ALL

        SELECT a.inspector_id
        FROM appointments a
        JOIN tenants t ON t.id = a.tenant_id
        WHERE a.deleted_at IS NULL AND a.status = 'DONE' AND a.inspector_id IS NOT NULL
          AND a.scheduled_date BETWEEN ${from}::date AND ${to}::date
          AND NOT EXISTS (
            SELECT 1 FROM inspection_executions e2
            WHERE e2.appointment_id = a.id AND e2.inspector_id = a.inspector_id AND e2.abandoned_at IS NULL
          )
      ) completed
      GROUP BY inspector_id
    `);
    return new Map(rows.map((r) => [r.inspectorId, r.count]));
  }
}
