import type { Clock } from '../../../../shared/domain/clock';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import type { DayPlanCandidate, IDayPlanInputReader } from '../../domain/day-plan-input.reader';
import type { DayPlanRecord } from '../../domain/day-plan.entity';
import type { IDayPlanRepository } from '../../domain/day-plan.repository';
import { configuredOriginFor, fingerprintForCandidates } from '../day-plan-inputs';
import type { ComputeDayPlanUseCase } from './compute-day-plan.use-case';

/** The fresh predicted start for one appointment, for F06's tenant-time notice. */
export interface FreshDayPlanStop {
  /** STALE = could not recalculate now; the prediction is the stored one (F06 should not notify on it). */
  status: 'FRESH' | 'STALE';
  dayPlanId: string;
  planVersion: number;
  serviceStartAt: Date | null;
  eta: Date | null;
  lateS: number;
  approximate: boolean;
  manual: boolean;
  executed: boolean;
}

export interface GetFreshStopInput {
  appointmentId: string;
  now?: Date;
}

function liveExecuted(c: DayPlanCandidate | undefined, fallback: boolean): boolean {
  if (!c) return fallback;
  return c.appointmentStatus === 'DONE' || (c.startedAt !== null && c.abandonedAt === null);
}

export class GetFreshStopForAppointmentUseCase {
  constructor(
    private readonly reader: IDayPlanInputReader,
    private readonly repo: IDayPlanRepository,
    private readonly compute: ComputeDayPlanUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(input: GetFreshStopInput): Promise<FreshDayPlanStop | null> {
    const now = input.now ?? this.clock.now();
    const key = await this.reader.loadAppointmentPlanKey(input.appointmentId);
    if (!key) return null;

    const inspector = await this.reader.loadInspectorContext(key.inspectorId);
    if (!inspector) return null;

    const plan = await this.repo.findByInspectorAndDate(key.inspectorId, key.date);
    if (!plan) return null;

    const todayCivil = civilDateInTimezone(now, inspector.timezone);
    const isPast = key.date < todayCivil;
    const candidates = await this.reader.loadCandidates(key.inspectorId, key.date, todayCivil);
    const configured = configuredOriginFor(plan, inspector);
    const currentFp = fingerprintForCandidates(candidates, configured);
    const matches = plan.inputFingerprint === currentFp;

    let record: DayPlanRecord;
    let status: 'FRESH' | 'STALE';
    if (isPast) {
      record = plan;
      status = plan.status !== 'STALE' && matches ? 'FRESH' : 'STALE';
    } else if (plan.status !== 'STALE' && matches) {
      record = plan;
      status = 'FRESH';
    } else if (plan.status === 'STALE' && matches) {
      const cleared = await this.repo.clearStale(plan.id, plan.version);
      if (cleared) {
        record = cleared;
        status = 'FRESH';
      } else {
        record = await this.recompute(key);
        status = record.status === 'STALE' ? 'STALE' : 'FRESH';
      }
    } else {
      record = await this.recompute(key);
      status = record.status === 'STALE' ? 'STALE' : 'FRESH';
    }

    const stop = record.stops.find((s) => s.appointmentId === input.appointmentId);
    if (!stop) return null; // the appointment left the plan

    return {
      status,
      dayPlanId: record.id,
      planVersion: record.version,
      serviceStartAt: stop.serviceStartAt,
      eta: stop.eta,
      lateS: stop.lateS,
      approximate: stop.approximate,
      manual: stop.manual,
      executed: liveExecuted(candidates.find((c) => c.appointmentId === input.appointmentId), stop.executed),
    };
  }

  private recompute(key: { inspectorId: string; date: string }): Promise<DayPlanRecord> {
    return this.compute.execute({ inspectorId: key.inspectorId, date: key.date, trigger: 'ON_OPEN' });
  }
}
