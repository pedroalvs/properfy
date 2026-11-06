import { type PrismaClient } from '@prisma/client';
import {
  zonedWallTimeToUtc,
  type EtaPlanInput,
  type EtaPlanStop,
  type EtaRealEvents,
} from '@properfy/shared';
import type { IInspectorFieldEventRepository } from '../../inspector-execution/domain/inspector-field-event.repository';
import type {
  ITenantEtaPlanReader,
  LoadedTenantEtaPlan,
  TenantEtaPlanRef,
  TenantEtaSweepCandidate,
  TenantEtaStopMeta,
} from '../domain/tenant-eta-plan.reader';

interface PlanHeadRow {
  id: string;
  version: number;
  plan_date: Date;
  timezone: string;
  origin_source: string;
  departure_at: Date | null;
  approximate: boolean;
}

interface PlanStopRow {
  appointment_id: string;
  sequence: number;
  travel_s: number;
  duration_minutes: number;
  window_start_at: Date;
  window_end_at: Date;
  window_timezone: string;
  missing_coordinates: boolean;
  service_start_at: Date | null;
  service_end_at: Date | null;
  published_service_start_at: Date | null;
  status: string;
  tenant_id: string;
  scheduled_date: Date;
  rental_tenant_confirmation_status: TenantEtaStopMeta['rentalTenantConfirmationStatus'];
  key_required: boolean;
  requires_rental_tenant_confirmation: boolean;
  started_at: Date | null;
  finished_at: Date | null;
}

const civil = (d: Date): string => d.toISOString().slice(0, 10);

export class PrismaTenantEtaPlanReader implements ITenantEtaPlanReader {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fieldEventRepo: IInspectorFieldEventRepository,
  ) {}

  async loadPlan(dayPlanId: string): Promise<LoadedTenantEtaPlan | null> {
    const head = await this.prisma.$queryRaw<PlanHeadRow[]>`
      SELECT id, version, plan_date, timezone, origin_source, departure_at, approximate
        FROM day_plans WHERE id = ${dayPlanId}
    `;
    const planHead = head[0];
    if (!planHead) return null;

    const rows = await this.prisma.$queryRaw<PlanStopRow[]>`
      SELECT s.appointment_id, s.sequence, s.travel_s, s.duration_minutes,
             s.window_start_at, s.window_end_at, s.window_timezone, s.missing_coordinates,
             s.service_start_at, s.service_end_at, s.published_service_start_at,
             a.status, a.tenant_id, a.scheduled_date,
             a.rental_tenant_confirmation_status, a.key_required,
             st.requires_rental_tenant_confirmation,
             CASE WHEN e.abandoned_at IS NULL THEN e.started_at END  AS started_at,
             CASE WHEN e.abandoned_at IS NULL THEN e.finished_at END AS finished_at
        FROM day_plan_stops s
        JOIN day_plans p ON p.id = s.day_plan_id
        JOIN appointments a ON a.id = s.appointment_id
                           AND a.inspector_id = p.inspector_id
                           AND a.deleted_at IS NULL
        JOIN service_types st ON st.id = a.service_type_id
        LEFT JOIN inspection_executions e ON e.appointment_id = s.appointment_id
       WHERE s.day_plan_id = ${dayPlanId}
       ORDER BY s.sequence
    `;

    const stops: EtaPlanStop[] = [];
    const executions: EtaRealEvents['executions'] = new Map();
    const stopMeta = new Map<string, TenantEtaStopMeta>();

    for (const r of rows) {
      stops.push({
        appointmentId: r.appointment_id,
        sequence: r.sequence,
        tenantId: r.tenant_id,
        scheduledDate: civil(r.scheduled_date),
        appointmentStatus: r.status,
        travelS: r.travel_s,
        durationMinutes: r.duration_minutes,
        windowStartAt: r.window_start_at,
        windowEndAt: r.window_end_at,
        windowTimezone: r.window_timezone,
        missingCoordinates: r.missing_coordinates,
        serviceStartAt: r.service_start_at,
        serviceEndAt: r.service_end_at,
        publishedServiceStartAt: r.published_service_start_at,
      });
      if (r.started_at !== null || r.finished_at !== null) {
        executions.set(r.appointment_id, { startedAt: r.started_at, finishedAt: r.finished_at });
      }
      stopMeta.set(r.appointment_id, {
        rentalTenantConfirmationStatus: r.rental_tenant_confirmation_status,
        keyRequired: r.key_required,
        requiresRentalTenantConfirmation: r.requires_rental_tenant_confirmation,
      });
    }

    // Late notices: query from the earliest agency midnight across the stops, then
    // keep each notice only when it is at/after its own stop's agency midnight.
    const lateNotices: EtaRealEvents['lateNotices'] = new Map();
    if (stops.length > 0) {
      const midnightByAppointment = new Map(
        stops.map((s) => [
          s.appointmentId,
          zonedWallTimeToUtc(s.scheduledDate, '00:00', s.windowTimezone),
        ]),
      );
      const earliestSince = new Date(
        Math.min(...[...midnightByAppointment.values()].map((d) => d.getTime())),
      );
      const found = await this.fieldEventRepo.findLatestLateNoticeByAppointmentIds(
        stops.map((s) => s.appointmentId),
        earliestSince,
      );
      for (const n of found) {
        const ownMidnight = midnightByAppointment.get(n.appointmentId);
        if (ownMidnight && n.createdAt.getTime() >= ownMidnight.getTime()) {
          lateNotices.set(n.appointmentId, {
            minutesLate: n.minutesLate,
            createdAt: n.createdAt,
            clientOccurredAt: n.clientOccurredAt,
          });
        }
      }
    }

    const plan: EtaPlanInput = {
      dayPlanId: planHead.id,
      planVersion: planHead.version,
      planDate: civil(planHead.plan_date),
      timezone: planHead.timezone,
      hasOrigin: planHead.origin_source !== 'NONE',
      departureAt: planHead.departure_at,
      approximate: planHead.approximate,
      stops,
    };

    return { plan, events: { executions, lateNotices }, stopMeta };
  }

  async findPlanByInspectorDate(
    inspectorId: string,
    planDate: string,
  ): Promise<TenantEtaPlanRef | null> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; appointment_ids: string[] }>>`
      SELECT p.id,
             COALESCE(
               array_agg(s.appointment_id ORDER BY s.sequence)
                 FILTER (WHERE a.id IS NOT NULL),
               ARRAY[]::text[]
             ) AS appointment_ids
        FROM day_plans p
        LEFT JOIN day_plan_stops s ON s.day_plan_id = p.id
        LEFT JOIN appointments a ON a.id = s.appointment_id
                                AND a.inspector_id = p.inspector_id
                                AND a.deleted_at IS NULL
       WHERE p.inspector_id = ${inspectorId}
         AND p.plan_date = ${planDate}::date
       GROUP BY p.id
    `;
    const row = rows[0];
    if (!row) return null;
    return { dayPlanId: row.id, appointmentIds: row.appointment_ids };
  }

  async listSweepCandidates(now: Date): Promise<TenantEtaSweepCandidate[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ day_plan_id: string; inspector_id: string; plan_date: Date }>
    >`
      SELECT p.id AS day_plan_id, p.inspector_id, p.plan_date
        FROM day_plans p
        JOIN day_plan_stops s ON s.day_plan_id = p.id
        JOIN appointments a ON a.id = s.appointment_id
                           AND a.inspector_id = p.inspector_id
                           AND a.deleted_at IS NULL AND a.status = 'SCHEDULED'
        LEFT JOIN inspection_executions e ON e.appointment_id = s.appointment_id
       WHERE p.published_at IS NOT NULL
         AND p.plan_date = (${now}::timestamptz AT TIME ZONE p.timezone)::date
         AND (e.id IS NULL OR e.abandoned_at IS NOT NULL OR e.started_at IS NULL)
       GROUP BY p.id, p.inspector_id, p.plan_date
    `;
    return rows.map((r) => ({
      dayPlanId: r.day_plan_id,
      inspectorId: r.inspector_id,
      planDate: civil(r.plan_date),
    }));
  }
}
