import type { DayPlanResponse, InspectorBaseAddress } from '@properfy/shared';
import type { Clock } from '../../../../shared/domain/clock';
import type { AuditService } from '../../../../shared/domain/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import {
  formatGeocodingQuery,
  isSameGeocodingAddress,
  type GeocodableAddress,
} from '../../../../shared/domain/geocoding-address';
import type { IGeocodingService } from '../../../property/domain/geocoding.service';
import { geocodeWithTimeout } from '../../../property/application/services/geocode-with-timeout';
import { classifyStops, type ClassifiableStop } from '../../domain/classify-stops';
import { isPublicationOpenForInspector } from '../../domain/publication-window';
import type { IDayPlanInputReader, InspectorDayPlanContext } from '../../domain/day-plan-input.reader';
import type { DayPlanRecord } from '../../domain/day-plan.entity';
import type { IDayPlanRepository } from '../../domain/day-plan.repository';
import {
  DayPlanOriginGeocoderUnavailableError,
  dayPlanAlreadyStarted,
  dayPlanDateInPast,
  dayPlanNotFound,
  dayPlanNotPublished,
  dayPlanOriginNotFound,
} from '../../domain/day-plan.errors';
import { configuredOriginFor, fingerprintForCandidates } from '../day-plan-inputs';
import { buildDayPlanResponse } from '../day-plan-response.builder';
import type { ComputeDayPlanUseCase } from './compute-day-plan.use-case';

interface OriginContext {
  now: Date;
  inspector: InspectorDayPlanContext;
  todayCivil: string;
  isToday: boolean;
  plan: DayPlanRecord | null;
  candidates: Awaited<ReturnType<IDayPlanInputReader['loadCandidates']>>;
  hasExecutedToday: boolean;
  currentFp: string;
}

abstract class DayPlanOriginBase {
  constructor(
    protected readonly reader: IDayPlanInputReader,
    protected readonly repo: IDayPlanRepository,
    protected readonly compute: ComputeDayPlanUseCase,
    protected readonly clock: Clock,
  ) {}

  /** Shared guards + state load for both set and clear. */
  protected async load(inspectorId: string, date: string, now: Date): Promise<OriginContext> {
    const inspector = await this.reader.loadInspectorContext(inspectorId);
    if (!inspector || !inspector.active) throw dayPlanNotFound();

    const todayCivil = civilDateInTimezone(now, inspector.timezone);
    if (date < todayCivil) throw dayPlanDateInPast();
    const isToday = date === todayCivil;
    const windowOpen = isPublicationOpenForInspector(date, now, inspector.timezone);

    const plan = await this.repo.findByInspectorAndDate(inspectorId, date);
    if (plan && !plan.publishedAt && !windowOpen) throw dayPlanNotPublished();
    if (!plan && !isToday && !windowOpen) throw dayPlanNotPublished();

    const candidates = await this.reader.loadCandidates(inspectorId, date, todayCivil);
    const classifiable: ClassifiableStop[] = candidates.map((c) => ({
      appointmentId: c.appointmentId,
      appointmentStatus: c.appointmentStatus,
      startedAt: c.startedAt,
      finishedAt: c.finishedAt,
      abandonedAt: c.abandonedAt,
      windowStartAt: c.windowStartAt,
    }));
    const { executed } = classifyStops(classifiable);
    const hasExecutedToday = executed.length > 0 && date <= todayCivil;

    const configured = configuredOriginFor(plan, inspector);
    const currentFp = fingerprintForCandidates(candidates, configured);
    return { now, inspector, todayCivil, isToday, plan, candidates, hasExecutedToday, currentFp };
  }

  protected build(ctx: OriginContext, record: DayPlanRecord): DayPlanResponse {
    return buildDayPlanResponse(record, ctx.candidates, ctx.inspector, ctx.now, ctx.isToday);
  }

  protected isFresh(ctx: OriginContext): boolean {
    return ctx.plan !== null && ctx.plan.status !== 'STALE' && ctx.plan.inputFingerprint === ctx.currentFp;
  }
}

export interface SetDayPlanOriginInput {
  inspectorId: string;
  actorUserId: string;
  date: string;
  address: InspectorBaseAddress;
  now?: Date;
}

export class SetDayPlanOriginUseCase extends DayPlanOriginBase {
  constructor(
    reader: IDayPlanInputReader,
    repo: IDayPlanRepository,
    compute: ComputeDayPlanUseCase,
    clock: Clock,
    private readonly geocoder: IGeocodingService,
    private readonly audit: AuditService,
    private readonly logger: Logger,
  ) {
    super(reader, repo, compute, clock);
  }

  async execute(input: SetDayPlanOriginInput): Promise<DayPlanResponse> {
    const now = input.now ?? this.clock.now();
    const ctx = await this.load(input.inspectorId, input.date, now);

    // The day has started — the route continues from the last stop; the override can't change.
    if (ctx.hasExecutedToday) throw dayPlanAlreadyStarted();

    // Idempotent: same address already applied on a fresh plan → no geocoding, no recompute.
    if (ctx.plan?.originOverride && this.isFresh(ctx) && isSameGeocodingAddress(input.address as unknown as GeocodableAddress, ctx.plan.originOverride as unknown as GeocodableAddress)) {
      return this.build(ctx, ctx.plan);
    }

    let coords: { lat: number; lng: number } | null;
    try {
      coords = await geocodeWithTimeout(this.geocoder, formatGeocodingQuery(input.address as unknown as GeocodableAddress), { mode: 'permanent' });
    } catch (err) {
      this.logger.info({ errorName: err instanceof Error ? err.name : 'unknown' }, 'day_plan.origin_geocode_failed');
      throw new DayPlanOriginGeocoderUnavailableError();
    }
    if (!coords) throw dayPlanOriginNotFound();

    const record = await this.compute.execute({
      inspectorId: input.inspectorId,
      date: input.date,
      trigger: 'ORIGIN_CHANGE',
      actorUserId: input.actorUserId,
      applyOrigin: { address: input.address, lat: coords.lat, lng: coords.lng },
      now,
    });

    this.audit.log({
      action: 'day_plan.origin_overridden',
      actorType: 'USER',
      actorId: input.actorUserId,
      entityType: 'DayPlan',
      entityId: record.id,
      tenantId: null,
      after: { suburb: input.address.suburb, state: input.address.state, postcode: input.address.postcode },
    });

    return this.build(ctx, record);
  }
}

export interface ClearDayPlanOriginInput {
  inspectorId: string;
  actorUserId: string;
  date: string;
  now?: Date;
}

export class ClearDayPlanOriginUseCase extends DayPlanOriginBase {
  constructor(
    reader: IDayPlanInputReader,
    repo: IDayPlanRepository,
    compute: ComputeDayPlanUseCase,
    clock: Clock,
    private readonly audit: AuditService,
  ) {
    super(reader, repo, compute, clock);
  }

  async execute(input: ClearDayPlanOriginInput): Promise<DayPlanResponse> {
    const now = input.now ?? this.clock.now();
    const ctx = await this.load(input.inspectorId, input.date, now);

    // Idempotent: no override already, on a fresh plan → nothing to do.
    if (ctx.plan && !ctx.plan.originOverride && this.isFresh(ctx)) {
      return this.build(ctx, ctx.plan);
    }

    const record = await this.compute.execute({
      inspectorId: input.inspectorId,
      date: input.date,
      trigger: 'ORIGIN_CHANGE',
      actorUserId: input.actorUserId,
      applyOrigin: null,
      now,
    });

    this.audit.log({
      action: 'day_plan.origin_override_cleared',
      actorType: 'USER',
      actorId: input.actorUserId,
      entityType: 'DayPlan',
      entityId: record.id,
      tenantId: null,
      metadata: { date: input.date },
    });

    return this.build(ctx, record);
  }
}
