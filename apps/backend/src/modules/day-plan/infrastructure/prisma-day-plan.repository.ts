import { Prisma, type PrismaClient } from '@prisma/client';
import { addCivilDays, type InspectorBaseAddress, type RouteWeights } from '@properfy/shared';
import { deriveDueInspectors } from '../application/publish-due';
import type { DayPlanRecord, DayPlanStopRecord } from '../domain/day-plan.entity';
import type {
  EtaAccuracySample,
  IDayPlanRepository,
  PublishDueEntry,
  SaveDayPlanInput,
  SaveDayPlanStop,
} from '../domain/day-plan.repository';

const DAY_PLAN_PUBLISH_JOB = 'day-plan.publish';

type DbClient = PrismaClient | Prisma.TransactionClient;

const LIVE_STATUSES = ['SCHEDULED', 'DONE'] as const;

function toNum(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

function dateOnly(civil: string): Date {
  return new Date(`${civil}T00:00:00.000Z`);
}

/** A `@db.Date` column reads back as UTC midnight; take its civil `YYYY-MM-DD`. */
function civilOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Store a JSON value or SQL NULL (Prisma needs the explicit sentinel for nullable Json). */
function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

export class PrismaDayPlanRepository implements IDayPlanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByInspectorAndDate(
    inspectorId: string,
    planDate: string,
  ): Promise<DayPlanRecord | null> {
    const row = await this.prisma.dayPlan.findUnique({
      where: { inspector_id_plan_date: { inspector_id: inspectorId, plan_date: dateOnly(planDate) } },
      include: {
        stops: {
          orderBy: { sequence: 'asc' },
          include: {
            appointment: { select: { status: true, deleted_at: true, inspector_id: true } },
          },
        },
      },
    });
    if (!row) return null;
    return this.mapPlan(row, inspectorId);
  }

  async saveComputed(input: SaveDayPlanInput): Promise<DayPlanRecord | null> {
    const planFields = this.mapPlanFields(input);
    const savedId = await this.prisma.$transaction(async (tx) => {
      if (input.id === null || input.expectedVersion === null) {
        try {
          const created = await tx.dayPlan.create({ data: { ...planFields, version: 1 } });
          await this.insertStops(tx, created.id, input.stops);
          return created.id;
        } catch (err) {
          // Lost the insert race (unique inspector_id+plan_date) → let the caller retry.
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
          throw err;
        }
      }
      const updated = await tx.dayPlan.updateMany({
        where: { id: input.id, version: input.expectedVersion },
        data: {
          ...planFields,
          version: { increment: 1 },
          stale_at: null,
          stale_reason: null,
        },
      });
      if (updated.count === 0) return null; // CAS lost
      await tx.dayPlanStop.deleteMany({ where: { day_plan_id: input.id } });
      await this.insertStops(tx, input.id, input.stops);
      return input.id;
    });
    if (savedId === null) return null;
    return this.findById(savedId);
  }

  async clearStale(id: string, expectedVersion: number): Promise<DayPlanRecord | null> {
    // CAS in one statement: STALE → PUBLISHED (or DRAFT when never published), version + 1,
    // stale_* cleared. No routing (L-F04-01).
    const affected = await this.prisma.$executeRaw`
      UPDATE "day_plans"
      SET "status" = CASE WHEN "published_at" IS NOT NULL THEN 'PUBLISHED'::"DayPlanStatus" ELSE 'DRAFT'::"DayPlanStatus" END,
          "version" = "version" + 1,
          "stale_at" = NULL,
          "stale_reason" = NULL,
          "updated_at" = now()
      WHERE "id" = ${id} AND "version" = ${expectedVersion}
    `;
    if (affected === 0) return null;
    return this.findById(id);
  }

  async markStaleByAppointmentIds(appointmentIds: string[], reason: string): Promise<number> {
    if (appointmentIds.length === 0) return 0;
    const result = await this.prisma.$executeRaw`
      UPDATE "day_plans" SET "status" = 'STALE'::"DayPlanStatus", "stale_at" = now(),
             "stale_reason" = ${reason}, "version" = "version" + 1, "updated_at" = now()
      WHERE "status" <> 'STALE'
        AND "plan_date" >= (now() AT TIME ZONE "timezone")::date
        AND ( "id" IN (SELECT "day_plan_id" FROM "day_plan_stops" WHERE "appointment_id" = ANY(${appointmentIds}))
           OR ("inspector_id", "plan_date") IN (
                SELECT "inspector_id", "scheduled_date" FROM "appointments"
                WHERE "id" = ANY(${appointmentIds}) AND "inspector_id" IS NOT NULL) )
    `;
    return result;
  }

  async markStaleByInspector(inspectorId: string, reason: string): Promise<number> {
    const result = await this.prisma.$executeRaw`
      UPDATE "day_plans" SET "status" = 'STALE'::"DayPlanStatus", "stale_at" = now(),
             "stale_reason" = ${reason}, "version" = "version" + 1, "updated_at" = now()
      WHERE "inspector_id" = ${inspectorId} AND "status" = 'PUBLISHED'
        AND "plan_date" BETWEEN (now() AT TIME ZONE "timezone")::date
                            AND (now() AT TIME ZONE "timezone")::date + 1
    `;
    return result;
  }

  async markNotified(id: string): Promise<void> {
    await this.prisma.dayPlan.update({ where: { id }, data: { notified_at: new Date() } });
  }

  async loadPublishDue(): Promise<PublishDueEntry[]> {
    // (§6) Derive the due set from the current `day-plan.publish` claims: each claim
    // enables plan_date = local_date + 1. We load the claims, tomorrow's SCHEDULED
    // appointments (ACTIVE inspector + ACTIVE agency only), and the plan state for
    // those dates, then apply the pure coverage rules (every agency claimed; not yet
    // published-and-notified).
    const claims = await this.prisma.cronJobRun.findMany({
      where: { job_name: DAY_PLAN_PUBLISH_JOB },
      select: { tenant_id: true, local_date: true },
    });
    if (claims.length === 0) return [];

    const claimRows = claims.map((c) => ({ tenantId: c.tenant_id, localDate: civilOf(c.local_date) }));
    const planDateCivils = [...new Set(claimRows.map((c) => addCivilDays(c.localDate, 1)))];
    const planDateObjs = planDateCivils.map(dateOnly);

    const appts = await this.prisma.appointment.findMany({
      where: {
        status: 'SCHEDULED',
        deleted_at: null,
        inspector_id: { not: null },
        scheduled_date: { in: planDateObjs },
        tenant: { status: 'ACTIVE' },
        inspector: { is: { status: 'ACTIVE', deleted_at: null } },
      },
      select: { inspector_id: true, tenant_id: true, scheduled_date: true },
    });

    const plans = await this.prisma.dayPlan.findMany({
      where: { plan_date: { in: planDateObjs } },
      select: { inspector_id: true, plan_date: true, published_at: true, notified_at: true },
    });

    return deriveDueInspectors({
      claims: claimRows,
      scheduledAppts: appts.map((a) => ({
        inspectorId: a.inspector_id!,
        tenantId: a.tenant_id,
        scheduledDate: civilOf(a.scheduled_date),
      })),
      plans: plans.map((p) => ({
        inspectorId: p.inspector_id,
        planDate: civilOf(p.plan_date),
        publishedAt: p.published_at,
        notifiedAt: p.notified_at,
      })),
    });
  }

  async getEtaAccuracySamples(fromCivil: string, toCivil: string): Promise<EtaAccuracySample[]> {
    const rows = await this.prisma.$queryRaw<Array<{ err_min: number }>>`
      SELECT abs(extract(epoch FROM (e."started_at" - s."published_service_start_at"))) / 60.0 AS err_min
      FROM "day_plan_stops" s
      JOIN "day_plans" p ON p."id" = s."day_plan_id"
      JOIN "appointments" a ON a."id" = s."appointment_id" AND a."inspector_id" = p."inspector_id"
                           AND a."deleted_at" IS NULL AND a."status" IN ('SCHEDULED','DONE')
      JOIN "inspection_executions" e ON e."appointment_id" = s."appointment_id"
      WHERE p."plan_date" BETWEEN ${dateOnly(fromCivil)} AND ${dateOnly(toCivil)}
        AND s."published_service_start_at" IS NOT NULL
        AND s."published_predicted_at" < e."started_at"
        AND s."published_approximate" = false
        AND e."abandoned_at" IS NULL
    `;
    return rows.map((r) => ({ errorMinutes: Number(r.err_min) }));
  }

  // --- helpers ---------------------------------------------------------------

  private async findById(id: string): Promise<DayPlanRecord | null> {
    const row = await this.prisma.dayPlan.findUnique({
      where: { id },
      include: {
        stops: {
          orderBy: { sequence: 'asc' },
          include: {
            appointment: { select: { status: true, deleted_at: true, inspector_id: true } },
          },
        },
      },
    });
    return row ? this.mapPlan(row, row.inspector_id) : null;
  }

  private async insertStops(
    tx: DbClient,
    dayPlanId: string,
    stops: SaveDayPlanStop[],
  ): Promise<void> {
    if (stops.length === 0) return;
    await tx.dayPlanStop.createMany({
      data: stops.map((s) => ({
        day_plan_id: dayPlanId,
        appointment_id: s.appointmentId,
        sequence: s.sequence,
        eta: s.eta,
        service_start_at: s.serviceStartAt,
        service_end_at: s.serviceEndAt,
        published_eta: s.publishedEta,
        published_service_start_at: s.publishedServiceStartAt,
        published_predicted_at: s.publishedPredictedAt,
        published_approximate: s.publishedApproximate,
        travel_s: s.travelS,
        distance_m: s.distanceM,
        wait_s: s.waitS,
        late_s: s.lateS,
        window_start_at: s.windowStartAt,
        window_end_at: s.windowEndAt,
        window_timezone: s.windowTimezone,
        duration_minutes: s.durationMinutes,
        lat: s.lat,
        lng: s.lng,
        manual: s.manual,
        executed: s.executed,
        approximate: s.approximate,
        missing_coordinates: s.missingCoordinates,
      })),
    });
  }

  private mapPlanFields(input: SaveDayPlanInput): Prisma.DayPlanCreateManyInput {
    return {
      ...(input.id !== null ? { id: input.id } : {}),
      inspector_id: input.inspectorId,
      plan_date: dateOnly(input.planDate),
      timezone: input.timezone,
      status: input.status,
      input_fingerprint: input.inputFingerprint,
      published_at: input.publishedAt,
      notified_at: input.notifiedAt,
      computed_at: input.computedAt,
      computed_by_user_id: input.computedByUserId,
      last_trigger: input.lastTrigger,
      origin_source: input.originSource,
      origin_lat: input.originLat,
      origin_lng: input.originLng,
      origin_override_json: jsonOrNull(input.originOverride),
      origin_override_lat: input.originOverrideLat,
      origin_override_lng: input.originOverrideLng,
      origin_override_set_at: input.originOverrideSetAt,
      departure_at: input.departureAt,
      finish_eta: input.finishEta,
      total_drive_s: input.totalDriveS,
      total_wait_s: input.totalWaitS,
      total_service_s: input.totalServiceS,
      total_late_s: input.totalLateS,
      total_distance_m: input.totalDistanceM,
      feasible: input.feasible,
      manual_order: input.manualOrder,
      suggested_order_json: input.suggestedOrder,
      weights_json: input.weights as unknown as Prisma.InputJsonValue,
      optimizer_method: input.optimizerMethod,
      routing_provider: input.routingProvider,
      matrix_profile: input.matrixProfile,
      approximate: input.approximate,
      approximate_reason: input.approximateReason,
    };
  }

  private mapPlan(
    row: Prisma.DayPlanGetPayload<{
      include: { stops: { include: { appointment: { select: { status: true; deleted_at: true; inspector_id: true } } } } };
    }>,
    inspectorId: string,
  ): DayPlanRecord {
    const stops: DayPlanStopRecord[] = row.stops
      .filter(
        (s) =>
          s.appointment.deleted_at === null &&
          s.appointment.inspector_id === inspectorId &&
          (LIVE_STATUSES as readonly string[]).includes(s.appointment.status),
      )
      .map((s) => ({
        id: s.id,
        appointmentId: s.appointment_id,
        sequence: s.sequence,
        eta: s.eta,
        serviceStartAt: s.service_start_at,
        serviceEndAt: s.service_end_at,
        publishedEta: s.published_eta,
        publishedServiceStartAt: s.published_service_start_at,
        publishedPredictedAt: s.published_predicted_at,
        publishedApproximate: s.published_approximate,
        travelS: s.travel_s,
        distanceM: s.distance_m,
        waitS: s.wait_s,
        lateS: s.late_s,
        windowStartAt: s.window_start_at,
        windowEndAt: s.window_end_at,
        windowTimezone: s.window_timezone,
        durationMinutes: s.duration_minutes,
        lat: toNum(s.lat),
        lng: toNum(s.lng),
        manual: s.manual,
        executed: s.executed,
        approximate: s.approximate,
        missingCoordinates: s.missing_coordinates,
      }));
    return {
      id: row.id,
      inspectorId: row.inspector_id,
      planDate: row.plan_date.toISOString().slice(0, 10),
      timezone: row.timezone,
      status: row.status,
      version: row.version,
      inputFingerprint: row.input_fingerprint,
      publishedAt: row.published_at,
      notifiedAt: row.notified_at,
      computedAt: row.computed_at,
      computedByUserId: row.computed_by_user_id,
      lastTrigger: row.last_trigger,
      staleAt: row.stale_at,
      staleReason: row.stale_reason,
      originSource: row.origin_source,
      originLat: toNum(row.origin_lat),
      originLng: toNum(row.origin_lng),
      originOverride: (row.origin_override_json as InspectorBaseAddress | null) ?? null,
      originOverrideLat: toNum(row.origin_override_lat),
      originOverrideLng: toNum(row.origin_override_lng),
      originOverrideSetAt: row.origin_override_set_at,
      departureAt: row.departure_at,
      finishEta: row.finish_eta,
      totalDriveS: row.total_drive_s,
      totalWaitS: row.total_wait_s,
      totalServiceS: row.total_service_s,
      totalLateS: row.total_late_s,
      totalDistanceM: row.total_distance_m,
      feasible: row.feasible,
      manualOrder: row.manual_order,
      suggestedOrder: (row.suggested_order_json as string[]) ?? [],
      weights: row.weights_json as unknown as RouteWeights,
      optimizerMethod: row.optimizer_method,
      routingProvider: row.routing_provider,
      matrixProfile: row.matrix_profile,
      approximate: row.approximate,
      approximateReason: row.approximate_reason,
      // Plan B: routing results are never stored; the response path recomputes them on demand.
      routeGeometry: null,
      routingMatrix: null,
      legTravel: null,
      stops,
    };
  }
}
