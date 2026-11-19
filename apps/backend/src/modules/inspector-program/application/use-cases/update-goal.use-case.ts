import type { PrismaClient } from '@prisma/client';
import type { AuthContext, GoalResponse, UpdateGoalInput } from '@properfy/shared';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import type { AuditService } from '../../../../shared/domain/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import { civilDateInTimezone } from '../../../../shared/domain/timezone-date';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import { getCanonicalPeriod } from '../../../billing/domain/billing-period.service';
import type { CivilDate } from '../../domain/goal.entity';
import { currentGoalPeriod, minEndsAt } from '../../domain/goal-periods';
import { periodsToSkipOnReactivation } from '../../domain/goal-periods';
import type { GoalPeriodClosureInsert, IGoalPeriodClosureRepository } from '../../domain/goal-period-closure.repository';
import type { GoalWithScope, IGoalRepository, UpdateGoalData } from '../../domain/goal.repository';
import {
  GoalEndInCurrentPeriodError,
  GoalEndNotAlignedError,
  GoalNotFoundError,
  GoalScopeRegionDeletedError,
} from '../../domain/inspector-program.errors';
import { scopeLabelFor } from '../../domain/scope-label';
import { toGoalResponse } from '../mappers';

const MS_PER_DAY = 86_400_000;
function addCivilDays(ymd: CivilDate, days: number): CivilDate {
  return new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** First day of the period that follows the one containing `today`. */
function nextPeriodStart(goal: GoalWithScope, today: CivilDate): CivilDate {
  const current = getCanonicalPeriod(goal.period, today);
  return getCanonicalPeriod(goal.period, addCivilDays(current.periodEnd, 1)).periodStart;
}

export interface UpdateGoalCommand {
  goalId: string;
  data: UpdateGoalInput;
  actor: AuthContext;
  requestId?: string;
}

/**
 * Update a goal (03.6, FR-026/FR-032). Target/reward edits on a running goal land
 * in the pending `next_*` terms (effective next period); on a not-yet-started goal
 * they apply directly. `endsAt` must stay a period boundary and not fall inside
 * the current period. Deactivation stamps `deactivated_at`; reactivation records
 * the skipped periods as `SKIPPED_INACTIVE` closures in the same transaction and
 * resumes the goal next period. A PATCH that changes nothing is a no-op (no audit).
 */
export class UpdateGoalUseCase {
  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly closureRepo: IGoalPeriodClosureRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: Clock = new SystemClock(),
    private readonly prisma?: PrismaClient,
  ) {}

  async execute({ goalId, data, actor, requestId }: UpdateGoalCommand): Promise<GoalResponse> {
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector_program.goals.manage',
      entityType: 'InspectorGoal',
    });

    const goal = await this.goalRepo.findById(goalId);
    if (!goal) throw new GoalNotFoundError();

    const today = civilDateInTimezone(this.clock.now(), PLATFORM_TIMEZONE);
    const update: UpdateGoalData = { updatedByUserId: actor.userId };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    let fieldChange = false;

    // ── Title ──
    if (data.title !== undefined && data.title !== goal.title) {
      update.title = data.title;
      before.title = goal.title;
      after.title = data.title;
      fieldChange = true;
    }

    // ── Target / reward (running → pending next_*, not-started → direct) ──
    const running = currentGoalPeriod(goal, today) !== null;
    const effectiveFrom = nextPeriodStart(goal, today);
    const targetChanged = data.target !== undefined && data.target !== goal.target;
    const rewardChanged = data.rewardAmount !== undefined && data.rewardAmount !== goal.rewardAmount;
    if (targetChanged || rewardChanged) {
      fieldChange = true;
      if (running) {
        if (targetChanged) {
          update.nextTarget = data.target;
          before.target = goal.target;
          after.nextTarget = data.target;
        }
        if (rewardChanged) {
          update.nextRewardAmount = data.rewardAmount;
          before.rewardAmount = goal.rewardAmount;
          after.nextRewardAmount = data.rewardAmount;
        }
        update.nextEffectiveFrom = effectiveFrom;
        after.nextEffectiveFrom = effectiveFrom;
      } else {
        if (targetChanged) {
          update.target = data.target;
          before.target = goal.target;
          after.target = data.target;
        }
        if (rewardChanged) {
          update.rewardAmount = data.rewardAmount;
          before.rewardAmount = goal.rewardAmount;
          after.rewardAmount = data.rewardAmount;
        }
      }
    }

    // ── endsAt (set a new boundary, or clear) ──
    if (data.endsAt !== undefined && data.endsAt !== goal.endsAt) {
      if (data.endsAt !== null) {
        const endPeriod = getCanonicalPeriod(goal.period, data.endsAt);
        if (endPeriod.periodEnd !== data.endsAt) throw new GoalEndNotAlignedError();
        if (data.endsAt < minEndsAt(goal, today)) throw new GoalEndInCurrentPeriodError();
      }
      update.endsAt = data.endsAt;
      before.endsAt = goal.endsAt;
      after.endsAt = data.endsAt;
      fieldChange = true;
    }

    // ── Active toggle (deactivate / reactivate) ──
    let lifecycle: 'deactivated' | 'reactivated' | null = null;
    let resumesOn: CivilDate | null = null;
    let skipClosures: GoalPeriodClosureInsert[] = [];
    if (data.active !== undefined && data.active !== goal.active) {
      if (data.active === false) {
        update.active = false;
        update.deactivatedAt = this.clock.now();
        lifecycle = 'deactivated';
      } else {
        // Reactivation. A region-volume goal whose region was deleted cannot resume.
        if (goal.metric === 'REGION_VOLUME' && goal.scopeRegionId === null) {
          throw new GoalScopeRegionDeletedError();
        }
        const closedStarts = (await this.closureRepo.findStartsByGoalIds([goalId])).get(goalId) ?? new Set<CivilDate>();
        const skips = periodsToSkipOnReactivation(goal, today, closedStarts);
        const label = scopeLabelFor(goal);
        const closedAt = this.clock.now();
        skipClosures = skips.map((p) => ({
          goalId,
          periodType: p.periodType,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          participantIds: [],
          participantsCount: 0,
          achieversCount: 0,
          promisedAmount: 0,
          scopeLabel: label,
          indexSnapshotDate: null,
          trigger: 'SKIPPED_INACTIVE',
          closedAt,
        }));
        resumesOn = today < goal.startsAt ? goal.startsAt : nextPeriodStart(goal, today);
        update.active = true;
        update.deactivatedAt = null;
        lifecycle = 'reactivated';
      }
    }

    // Nothing really changed → 200 with no write and no audit (FR-026).
    if (!fieldChange && lifecycle === null) {
      return toGoalResponse(goal, { today, lastClosedPeriod: null });
    }

    // Reactivation writes the skipped closures and the goal in one transaction.
    let updated: GoalWithScope;
    if (skipClosures.length > 0) {
      updated = await runInTransaction(this.prisma, async ({ tx }) => {
        await this.closureRepo.insertManySkipDuplicates(skipClosures, tx);
        return this.goalRepo.update(goalId, update, tx);
      });
    } else {
      updated = await this.goalRepo.update(goalId, update);
    }

    if (lifecycle === 'deactivated') {
      this.auditService.log({
        action: 'inspector_goal.deactivated',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'InspectorGoal',
        entityId: goalId,
        requestId,
        before: { active: true },
        after: { active: false, deactivatedAt: (update.deactivatedAt as Date).toISOString() },
      });
    }
    if (lifecycle === 'reactivated') {
      this.auditService.log({
        action: 'inspector_goal.reactivated',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'InspectorGoal',
        entityId: goalId,
        requestId,
        before: { active: false },
        after: { active: true },
        metadata: { skippedPeriods: skipClosures.length, resumesOn },
      });
    }
    if (fieldChange) {
      this.auditService.log({
        action: 'inspector_goal.updated',
        actorType: 'USER',
        actorId: actor.userId,
        entityType: 'InspectorGoal',
        entityId: goalId,
        requestId,
        before,
        after,
      });
    }

    return toGoalResponse(updated, { today, lastClosedPeriod: null, resumesOn });
  }
}
