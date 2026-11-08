import {
  GOAL_METRIC_KIND,
  UPCOMING_GOAL_LOOKAHEAD_DAYS,
  addCivilDays,
  isEarlyAccessLevel,
  resolveInspectorLevel,
  type BillingPeriodType,
  type GoalComparator,
  type GoalMetric,
  type InspectorLevel,
  type ReliabilityDetailStatus,
} from '@properfy/shared';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { getCanonicalPeriod } from '../../billing/domain/billing-period.service';
import type { ReliabilityFactsScope } from '../../reliability/domain/reliability-facts.reader';
import type { ReliabilityIndexReader } from '../../reliability/application/reliability-index.reader';
import type { ReliabilityMetricsService } from '../../reliability/application/reliability-metrics.service';
import type { Clock } from '../../../shared/domain/clock';
import type { IPlatformSettingsReader } from '../../../shared/domain/platform-settings';
import { civilDateInTimezone } from '../../../shared/domain/timezone-date';
import { evaluateGoal } from '../domain/evaluate-goal';
import type { CivilDate } from '../domain/goal.entity';
import type { GoalWithScope, IGoalRepository } from '../domain/goal.repository';
import { currentGoalPeriod, goalTermsForPeriod } from '../domain/goal-periods';
import type { IGoalPeriodClosureRepository } from '../domain/goal-period-closure.repository';
import { resolveParticipants } from '../domain/participants';
import type { IProgramInspectorReader } from '../domain/program-inspector.reader';
import { computeStreak, isStreakAtRisk } from '../domain/streak';

export type GoalProgressState =
  | 'MET_SO_FAR'
  | 'IN_PROGRESS'
  | 'BELOW_TARGET'
  | 'NOT_ENOUGH_SERVICES'
  | 'NO_DATA'
  | 'UPCOMING';

export interface GoalProgress {
  goalId: string;
  title: string;
  metric: GoalMetric;
  comparator: GoalComparator;
  target: number;
  period: { type: BillingPeriodType; start: CivilDate; end: CivilDate };
  daysLeft: number;
  rewardAmount: number;
  scopeLabel: string | null;
  value: number | null;
  serviceCount: number;
  countsSince: CivilDate | null;
  state: GoalProgressState;
}

export interface InspectorStanding {
  inspectorId: string;
  index: { score: number | null; status: ReliabilityDetailStatus | 'NOT_COMPUTED'; snapshotDate: CivilDate | null; position: number | null };
  level: InspectorLevel | null;
  streak: { cycle: BillingPeriodType | null; count: number; atRisk: boolean };
}

type MetricsPort = Pick<ReliabilityMetricsService, 'computeAll'>;
type IndexReaderPort = Pick<ReliabilityIndexReader, 'getCurrentIndexes'>;

const MS_PER_DAY = 86_400_000;
function daysBetween(from: CivilDate, to: CivilDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

function scopeKey(goal: GoalWithScope): string {
  if (goal.metric === 'REGION_VOLUME') return `region:${goal.scopeRegionId}`;
  if (goal.metric === 'SERVICE_TYPE_VOLUME') return `type:${goal.scopeServiceTypeId}`;
  return 'none';
}
function scopeOf(goal: GoalWithScope): ReliabilityFactsScope | undefined {
  if (goal.metric === 'REGION_VOLUME' && goal.scopeRegionId) return { regionId: goal.scopeRegionId };
  if (goal.metric === 'SERVICE_TYPE_VOLUME' && goal.scopeServiceTypeId) return { serviceTypeId: goal.scopeServiceTypeId };
  return undefined;
}
function scopeLabelFor(goal: GoalWithScope): string | null {
  if (goal.metric === 'REGION_VOLUME') return goal.scope.regionName;
  if (goal.metric === 'SERVICE_TYPE_VOLUME') return goal.scope.serviceTypeName;
  if (goal.scopeInspectorId !== null) return goal.scope.inspectorName;
  return null;
}

/**
 * Standing + partial-progress read model (Algorithms D/E/F), consumed by F08-2/4.
 * Levels and streaks are derived, never stored; partial progress runs one
 * `computeAll` per `(period, scope)` group, never one per inspector.
 */
export class InspectorProgramStandingService {
  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly closureRepo: IGoalPeriodClosureRepository,
    private readonly inspectorReader: IProgramInspectorReader,
    private readonly metricsService: MetricsPort,
    private readonly indexReader: IndexReaderPort,
    private readonly settingsReader: IPlatformSettingsReader,
    private readonly clock: Clock,
  ) {}

  async getStanding(inspectorId: string, now: Date): Promise<InspectorStanding> {
    const today = civilDateInTimezone(now, PLATFORM_TIMEZONE);
    const [programSettings, indexes, participations, progress] = await Promise.all([
      this.settingsReader.get('inspectorProgram'),
      this.indexReader.getCurrentIndexes([inspectorId]),
      this.closureRepo.findParticipations(inspectorId),
      this.getActiveGoalProgress(inspectorId, now),
    ]);
    const current = indexes[0];
    const score = current?.score ?? null;
    const streak = computeStreak({ today, participations });

    let atRisk = false;
    if (streak.cycle !== null) {
      const cyclePeriod = getCanonicalPeriod(streak.cycle, today);
      const cycleProgress = progress.filter((p) => p.period.type === streak.cycle && p.state !== 'UPCOMING');
      atRisk = isStreakAtRisk({
        streak: streak.count,
        today,
        currentPeriodEnd: cyclePeriod.periodEnd,
        participatesInCycleGoal: cycleProgress.length > 0,
        achievedSoFar: cycleProgress.some((p) => p.state === 'MET_SO_FAR'),
      });
    }

    return {
      inspectorId,
      index: {
        score,
        status: current?.status ?? 'NOT_COMPUTED',
        snapshotDate: current?.snapshotDate ?? null,
        position: current?.position ?? null,
      },
      level: resolveInspectorLevel(score, programSettings.levels),
      streak: { cycle: streak.cycle, count: streak.count, atRisk },
    };
  }

  getActiveGoalProgress(inspectorId: string, now: Date): Promise<GoalProgress[]> {
    return this.getActiveGoalProgressForMany([inspectorId], now).then((m) => m.get(inspectorId) ?? []);
  }

  async getActiveGoalProgressForMany(inspectorIds: string[], now: Date): Promise<Map<string, GoalProgress[]>> {
    const result = new Map<string, GoalProgress[]>(inspectorIds.map((id) => [id, []]));
    if (inspectorIds.length === 0) return result;
    const today = civilDateInTimezone(now, PLATFORM_TIMEZONE);
    const wanted = new Set(inspectorIds);

    const goals = await this.goalRepo.findActive();
    if (goals.length === 0) return result;

    const [inspectors, closedStarts] = await Promise.all([
      this.inspectorReader.loadActiveInspectors(),
      this.closureRepo.findStartsByGoalIds(goals.map((g) => g.id)),
    ]);
    const regionIds = [...new Set(goals.map((g) => g.scopeRegionId).filter((x): x is string => x !== null))];
    const regionLinks = await this.inspectorReader.loadRegionInspectorIds(regionIds);
    const relevantInspectors = inspectors.filter((i) => wanted.has(i.id));

    // Split goals into in-progress (evaluate) and upcoming (no computeAll).
    type Live = { goal: GoalWithScope; period: { start: CivilDate; end: CivilDate }; participants: string[] };
    const live: Live[] = [];
    const upcoming: Array<{ goal: GoalWithScope; period: { start: CivilDate; end: CivilDate }; participants: string[] }> = [];

    for (const goal of goals) {
      const regionSet = goal.scopeRegionId ? (regionLinks.get(goal.scopeRegionId) ?? new Set<string>()) : new Set<string>();
      const participants = resolveParticipants(goal, relevantInspectors, regionSet);
      if (participants.length === 0) continue;

      const current = currentGoalPeriod(goal, today);
      const currentSkippedOrClosed = current ? (closedStarts.get(goal.id)?.has(current.periodStart) ?? false) : false;
      if (current && !currentSkippedOrClosed) {
        live.push({ goal, period: { start: current.periodStart, end: current.periodEnd }, participants });
        continue;
      }
      // No evaluable current period: the goal has not started, or its current period was
      // skipped on reactivation. Offer the next period if it starts within the look-ahead.
      const upcomingStart =
        current === null ? (today < goal.startsAt ? goal.startsAt : null) : addCivilDays(current.periodEnd, 1);
      if (upcomingStart === null || upcomingStart <= today) continue;
      if (daysBetween(today, upcomingStart) > UPCOMING_GOAL_LOOKAHEAD_DAYS) continue;
      const nextPeriod = getCanonicalPeriod(goal.period, upcomingStart);
      if (goal.endsAt !== null && nextPeriod.periodEnd > goal.endsAt) continue;
      upcoming.push({ goal, period: { start: nextPeriod.periodStart, end: nextPeriod.periodEnd }, participants });
    }

    // One computeAll per (period, scope) group for the live goals.
    const groups = new Map<string, { start: CivilDate; end: CivilDate; scope?: ReliabilityFactsScope; ids: Set<string> }>();
    for (const l of live) {
      const key = `${l.period.start}|${l.period.end}|${scopeKey(l.goal)}`;
      const g = groups.get(key) ?? { start: l.period.start, end: l.period.end, scope: scopeOf(l.goal), ids: new Set<string>() };
      for (const id of l.participants) g.ids.add(id);
      groups.set(key, g);
    }
    const reliabilityIndex = live.length > 0 ? await this.settingsReader.get('reliabilityIndex') : null;
    const batchByKey = new Map<string, Awaited<ReturnType<MetricsPort['computeAll']>>>();
    for (const [key, g] of groups) {
      const to = today < g.end ? today : g.end;
      batchByKey.set(key, await this.metricsService.computeAll(g.start, to, [...g.ids], g.scope));
    }

    for (const l of live) {
      const terms = goalTermsForPeriod(l.goal, l.period.start);
      const batch = batchByKey.get(`${l.period.start}|${l.period.end}|${scopeKey(l.goal)}`);
      const countsSince = civilDateInTimezone(l.goal.createdAt, PLATFORM_TIMEZONE) > l.period.start ? l.period.start : null;
      for (const id of l.participants) {
        if (!wanted.has(id)) continue;
        const evaluation = evaluateGoal(l.goal, batch?.byInspector.get(id), { reliabilityIndex: reliabilityIndex!, periodEnd: today });
        result.get(id)?.push({
          goalId: l.goal.id,
          title: l.goal.title,
          metric: l.goal.metric,
          comparator: l.goal.comparator,
          target: terms.target,
          period: { type: l.goal.period, start: l.period.start, end: l.period.end },
          daysLeft: Math.max(0, daysBetween(today, l.period.end)),
          rewardAmount: terms.rewardAmount,
          scopeLabel: scopeLabelFor(l.goal),
          value: evaluation.value,
          serviceCount: evaluation.serviceCount,
          countsSince,
          state: progressState(l.goal.metric, evaluation.achieved, evaluation.reason),
        });
      }
    }

    for (const u of upcoming) {
      const terms = goalTermsForPeriod(u.goal, u.period.start);
      for (const id of u.participants) {
        if (!wanted.has(id)) continue;
        result.get(id)?.push({
          goalId: u.goal.id,
          title: u.goal.title,
          metric: u.goal.metric,
          comparator: u.goal.comparator,
          target: terms.target,
          period: { type: u.goal.period, start: u.period.start, end: u.period.end },
          daysLeft: daysBetween(today, u.period.start),
          rewardAmount: terms.rewardAmount,
          scopeLabel: scopeLabelFor(u.goal),
          value: null,
          serviceCount: 0,
          countsSince: null,
          state: 'UPCOMING',
        });
      }
    }

    return result;
  }

  async hasEarlyAccess(inspectorId: string, _now: Date): Promise<{ hasAccess: boolean; reason: 'LEVEL' | 'DISABLED' | null }> {
    const [programSettings, indexes] = await Promise.all([
      this.settingsReader.get('inspectorProgram'),
      this.indexReader.getCurrentIndexes([inspectorId]),
    ]);
    if (!programSettings.earlyAccess.enabled) return { hasAccess: false, reason: 'DISABLED' };
    const level = resolveInspectorLevel(indexes[0]?.score ?? null, programSettings.levels);
    const hasAccess = isEarlyAccessLevel(level, programSettings.earlyAccess.minLevel);
    return { hasAccess, reason: hasAccess ? null : 'LEVEL' };
  }
}

function progressState(
  metric: GoalMetric,
  achieved: boolean,
  reason: 'NOT_ENOUGH_SERVICES' | 'NO_DATA' | undefined,
): GoalProgressState {
  if (reason === 'NOT_ENOUGH_SERVICES') return 'NOT_ENOUGH_SERVICES';
  if (reason === 'NO_DATA') return 'NO_DATA';
  if (achieved) return 'MET_SO_FAR';
  return GOAL_METRIC_KIND[metric] === 'VOLUME' ? 'IN_PROGRESS' : 'BELOW_TARGET';
}
