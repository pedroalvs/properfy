import type { DayPlanResponse } from '@properfy/shared';
import type { Clock } from '../../../../shared/domain/clock';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import { isPublicationOpenForInspector } from '../../domain/publication-window';
import type { IDayPlanInputReader } from '../../domain/day-plan-input.reader';
import type { DayPlanRecord } from '../../domain/day-plan.entity';
import type { IDayPlanRepository } from '../../domain/day-plan.repository';
import { dayPlanNotFound, dayPlanNotPublished } from '../../domain/day-plan.errors';
import { configuredOriginFor, fingerprintForCandidates } from '../day-plan-inputs';
import { buildDayPlanResponse } from '../day-plan-response.builder';
import type { ComputeDayPlanUseCase } from './compute-day-plan.use-case';

export interface GetMyDayPlanInput {
  inspectorId: string;
  date: string;
  now?: Date;
}

/**
 * The inspector's own plan. A published plan is always returned (L-F04-02); a
 * fresh fingerprint is returned without routing; a STALE flag with an unchanged
 * fingerprint is cleared without routing (L-F04-01); a diverged fingerprint on
 * today/an open D+1 recomputes. Past dates never recompute.
 */
export class GetMyDayPlanUseCase {
  constructor(
    private readonly reader: IDayPlanInputReader,
    private readonly repo: IDayPlanRepository,
    private readonly compute: ComputeDayPlanUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(input: GetMyDayPlanInput): Promise<DayPlanResponse> {
    const now = input.now ?? this.clock.now();
    const inspector = await this.reader.loadInspectorContext(input.inspectorId);
    // Deactivated or soft-deleted inspectors are not served their plan (defence in
    // depth over auth; the publish job's due set likewise excludes non-ACTIVE inspectors).
    if (!inspector || !inspector.active) throw dayPlanNotFound();

    const todayCivil = civilDateInTimezone(now, inspector.timezone);
    const isToday = input.date === todayCivil;
    const isPast = input.date < todayCivil;
    const windowOpen = isPublicationOpenForInspector(input.date, now, inspector.timezone);

    const plan = await this.repo.findByInspectorAndDate(input.inspectorId, input.date);
    const candidates = await this.reader.loadCandidates(input.inspectorId, input.date, todayCivil);

    const record = await this.resolveRecord(input, plan, inspector, now, { isToday, isPast, windowOpen }, candidates);
    const freshCandidates =
      record === plan ? candidates : await this.reader.loadCandidates(input.inspectorId, input.date, todayCivil);
    return buildDayPlanResponse(record, freshCandidates, inspector, now, isToday);
  }

  private async resolveRecord(
    input: GetMyDayPlanInput,
    plan: DayPlanRecord | null,
    inspector: NonNullable<Awaited<ReturnType<IDayPlanInputReader['loadInspectorContext']>>>,
    now: Date,
    flags: { isToday: boolean; isPast: boolean; windowOpen: boolean },
    candidates: Awaited<ReturnType<IDayPlanInputReader['loadCandidates']>>,
  ): Promise<DayPlanRecord> {
    const configured = configuredOriginFor(plan, inspector);
    const currentFp = fingerprintForCandidates(candidates, configured);

    if (plan) {
      if (flags.isPast) return plan; // never recompute a past plan
      const published = plan.publishedAt !== null;
      if (!published && !flags.windowOpen) throw dayPlanNotPublished();

      const fresh = plan.status !== 'STALE' && plan.inputFingerprint === currentFp;
      if (fresh) return plan;
      if (plan.status === 'STALE' && plan.inputFingerprint === currentFp) {
        const cleared = await this.repo.clearStale(plan.id, plan.version);
        return cleared ?? (await this.recompute(input, now));
      }
      return this.recompute(input, now);
    }

    // No stored plan.
    if (flags.isPast) throw dayPlanNotFound();
    if (!flags.isToday && !flags.windowOpen) throw dayPlanNotPublished(); // D+1 before 19:30, or D+2+
    return this.recompute(input, now);
  }

  private recompute(input: GetMyDayPlanInput, now: Date): Promise<DayPlanRecord> {
    return this.compute.execute({ inspectorId: input.inspectorId, date: input.date, trigger: 'ON_OPEN', now });
  }
}
