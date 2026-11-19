import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../shared/domain/audit';
import type { Clock } from '../../../shared/domain/clock';
import { AuthorizationService } from '../../../shared/domain/authorization.service';
import { ForbiddenError } from '../../../shared/domain/errors';
import type { CreateGoalInput, UpdateGoalInput } from '@properfy/shared';
import type {
  CreateGoalData,
  GoalWithScope,
  IGoalRepository,
  IGoalScopeReader,
  UpdateGoalData,
} from '../domain/goal.repository';
import type { IGoalPeriodClosureRepository } from '../domain/goal-period-closure.repository';
import {
  GoalNotFoundError,
  GoalStartNotAlignedError,
  GoalStartInPastError,
  GoalEndNotAlignedError,
  GoalEndInCurrentPeriodError,
  GoalScopeRegionNotFoundError,
  GoalScopeRegionDeletedError,
} from '../domain/inspector-program.errors';
import { CreateGoalUseCase } from './use-cases/create-goal.use-case';
import { UpdateGoalUseCase } from './use-cases/update-goal.use-case';
import { ListGoalsUseCase } from './use-cases/list-goals.use-case';
import { GetGoalUseCase } from './use-cases/get-goal.use-case';
import { ListProgramPeriodsUseCase } from './use-cases/list-program-periods.use-case';

// 2026-11-10 13:00 Sydney (AEDT, UTC+11) → civil "today" = 2026-11-10 (a Tuesday).
// Current WEEKLY period: Mon 2026-11-09 .. Sun 2026-11-15; next starts 2026-11-16.
const NOW = new Date('2026-11-10T02:00:00.000Z');
const clock: Clock = { now: () => NOW };

function am(overrides: Partial<AuthContext> = {}): AuthContext {
  return { userId: 'user-am', tenantId: null, role: 'AM', branchId: null, inspectorId: null, ...overrides };
}

function buildGoal(overrides: Partial<GoalWithScope> = {}): GoalWithScope {
  return {
    id: 'goal-1',
    title: 'Weekly volume',
    metric: 'VOLUME',
    comparator: 'GTE',
    target: 10,
    period: 'WEEKLY',
    scopeRegionId: null,
    scopeServiceTypeId: null,
    scopeInspectorId: null,
    rewardAmount: 30,
    startsAt: '2026-11-16',
    endsAt: null,
    active: true,
    deactivatedAt: null,
    nextTarget: null,
    nextRewardAmount: null,
    nextEffectiveFrom: null,
    createdByUserId: 'user-am',
    updatedByUserId: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    scope: { regionName: null, serviceTypeName: null, inspectorName: null },
    ...overrides,
  };
}

function validCreate(overrides: Partial<CreateGoalInput> = {}): CreateGoalInput {
  return {
    title: 'Weekly volume',
    metric: 'VOLUME',
    comparator: 'GTE',
    period: 'WEEKLY',
    scopeRegionId: null,
    scopeServiceTypeId: null,
    scopeInspectorId: null,
    target: 10,
    rewardAmount: 30,
    startsAt: '2026-11-16',
    endsAt: null,
    ...overrides,
  };
}

function makeGoalRepo(): IGoalRepository {
  return {
    findActive: vi.fn(),
    findById: vi.fn(),
    findByIds: vi.fn(),
    create: vi.fn(async (data: CreateGoalData) =>
      buildGoal({
        id: 'goal-new',
        title: data.title,
        metric: data.metric,
        comparator: data.comparator,
        target: data.target,
        period: data.period,
        scopeRegionId: data.scopeRegionId,
        scopeServiceTypeId: data.scopeServiceTypeId,
        scopeInspectorId: data.scopeInspectorId,
        rewardAmount: data.rewardAmount,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        createdByUserId: data.createdByUserId,
      }),
    ),
    update: vi.fn(async (id: string, data: UpdateGoalData) => buildGoal({ id, ...coerceUpdate(data) })),
    list: vi.fn(),
    countActiveByScopeRegionId: vi.fn(),
    promoteNextTerms: vi.fn(),
  };
}

// Apply an UpdateGoalData onto a goal shape for the repo fake's return value.
function coerceUpdate(data: UpdateGoalData): Partial<GoalWithScope> {
  const out: Partial<GoalWithScope> = {};
  if (data.title !== undefined) out.title = data.title;
  if (data.target !== undefined) out.target = data.target;
  if (data.rewardAmount !== undefined) out.rewardAmount = data.rewardAmount;
  if (data.endsAt !== undefined) out.endsAt = data.endsAt;
  if (data.active !== undefined) out.active = data.active;
  if (data.deactivatedAt !== undefined) out.deactivatedAt = data.deactivatedAt;
  if (data.nextTarget !== undefined) out.nextTarget = data.nextTarget;
  if (data.nextRewardAmount !== undefined) out.nextRewardAmount = data.nextRewardAmount;
  if (data.nextEffectiveFrom !== undefined) out.nextEffectiveFrom = data.nextEffectiveFrom;
  out.updatedByUserId = data.updatedByUserId;
  return out;
}

function makeScopeReader(exists = true): IGoalScopeReader {
  return {
    regionExists: vi.fn(async () => exists),
    serviceTypeExists: vi.fn(async () => exists),
    inspectorExists: vi.fn(async () => exists),
  };
}

function makeClosureRepo(): IGoalPeriodClosureRepository {
  return {
    findStartsByGoalIds: vi.fn(async () => new Map()),
    insertManySkipDuplicates: vi.fn(async () => ({ count: 0 })),
    findByPeriod: vi.fn(),
    lastClosedByGoalId: vi.fn(async () => null),
    findParticipations: vi.fn(),
  };
}

let auditService: AuditService;
let authorizationService: AuthorizationService;

beforeEach(() => {
  auditService = { log: vi.fn() };
  authorizationService = new AuthorizationService(auditService);
});

describe('CreateGoalUseCase', () => {
  it('creates a goal, sets the author and audits inspector_goal.created', async () => {
    const goalRepo = makeGoalRepo();
    const useCase = new CreateGoalUseCase(goalRepo, makeScopeReader(), auditService, authorizationService, clock);

    const result = await useCase.execute({ data: validCreate(), actor: am() });

    expect(result.id).toBe('goal-new');
    expect(goalRepo.create).toHaveBeenCalledWith(expect.objectContaining({ createdByUserId: 'user-am', metric: 'VOLUME' }));
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'inspector_goal.created' }));
  });

  it('rejects a missing scope region (422)', async () => {
    const useCase = new CreateGoalUseCase(makeGoalRepo(), makeScopeReader(false), auditService, authorizationService, clock);
    await expect(
      useCase.execute({
        data: validCreate({ metric: 'REGION_VOLUME', scopeRegionId: '11111111-1111-1111-1111-111111111111' }),
        actor: am(),
      }),
    ).rejects.toBeInstanceOf(GoalScopeRegionNotFoundError);
  });

  it('rejects a start date that is not a period boundary', async () => {
    const useCase = new CreateGoalUseCase(makeGoalRepo(), makeScopeReader(), auditService, authorizationService, clock);
    await expect(useCase.execute({ data: validCreate({ startsAt: '2026-11-17' }), actor: am() })).rejects.toBeInstanceOf(
      GoalStartNotAlignedError,
    );
  });

  it('rejects a start date before the current period', async () => {
    const useCase = new CreateGoalUseCase(makeGoalRepo(), makeScopeReader(), auditService, authorizationService, clock);
    await expect(useCase.execute({ data: validCreate({ startsAt: '2026-11-02' }), actor: am() })).rejects.toBeInstanceOf(
      GoalStartInPastError,
    );
  });

  it('rejects an end date that is not a period boundary', async () => {
    const useCase = new CreateGoalUseCase(makeGoalRepo(), makeScopeReader(), auditService, authorizationService, clock);
    await expect(
      useCase.execute({ data: validCreate({ startsAt: '2026-11-16', endsAt: '2026-11-20' }), actor: am() }),
    ).rejects.toBeInstanceOf(GoalEndNotAlignedError);
  });

  it('forbids a non-AM/OP actor', async () => {
    const useCase = new CreateGoalUseCase(makeGoalRepo(), makeScopeReader(), auditService, authorizationService, clock);
    await expect(
      useCase.execute({ data: validCreate(), actor: am({ role: 'CL_ADMIN', tenantId: 't1' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('UpdateGoalUseCase', () => {
  function useCaseWith(goal: GoalWithScope | null, closureRepo = makeClosureRepo()) {
    const goalRepo = makeGoalRepo();
    (goalRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(goal);
    const useCase = new UpdateGoalUseCase(goalRepo, closureRepo, auditService, authorizationService, clock, undefined);
    return { useCase, goalRepo, closureRepo };
  }

  it('writes a running goal’s target change as a pending next-period term', async () => {
    const { useCase, goalRepo } = useCaseWith(buildGoal({ startsAt: '2026-11-09' }));
    const result = await useCase.execute({ goalId: 'goal-1', data: { target: 15 } as UpdateGoalInput, actor: am() });

    expect(goalRepo.update).toHaveBeenCalledWith(
      'goal-1',
      expect.objectContaining({ nextTarget: 15, nextEffectiveFrom: '2026-11-16' }),
    );
    expect(result.pendingChange).toEqual({ target: 15, rewardAmount: 30, effectiveFrom: '2026-11-16' });
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'inspector_goal.updated' }));
  });

  it('writes a not-yet-started goal’s target change directly', async () => {
    const { useCase, goalRepo } = useCaseWith(buildGoal({ startsAt: '2026-11-16' }));
    await useCase.execute({ goalId: 'goal-1', data: { target: 20 } as UpdateGoalInput, actor: am() });

    const call = (goalRepo.update as ReturnType<typeof vi.fn>).mock.calls[0]![1] as UpdateGoalData;
    expect(call.target).toBe(20);
    expect(call.nextTarget).toBeUndefined();
  });

  it('deactivates a goal and audits inspector_goal.deactivated', async () => {
    const { useCase, goalRepo } = useCaseWith(buildGoal({ startsAt: '2026-11-09' }));
    await useCase.execute({ goalId: 'goal-1', data: { active: false } as UpdateGoalInput, actor: am() });

    const call = (goalRepo.update as ReturnType<typeof vi.fn>).mock.calls[0]![1] as UpdateGoalData;
    expect(call.active).toBe(false);
    expect(call.deactivatedAt).toEqual(NOW);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'inspector_goal.deactivated' }));
  });

  it('reactivates a goal: writes SKIPPED_INACTIVE closures and resumes next period', async () => {
    const closureRepo = makeClosureRepo();
    const { useCase, goalRepo } = useCaseWith(
      buildGoal({ startsAt: '2026-11-02', active: false, deactivatedAt: new Date('2026-11-05T00:00:00.000Z') }),
      closureRepo,
    );
    const result = await useCase.execute({ goalId: 'goal-1', data: { active: true } as UpdateGoalInput, actor: am() });

    const inserted = (closureRepo.insertManySkipDuplicates as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(inserted).toHaveLength(2);
    expect(inserted.every((c: { trigger: string }) => c.trigger === 'SKIPPED_INACTIVE')).toBe(true);
    const call = (goalRepo.update as ReturnType<typeof vi.fn>).mock.calls[0]![1] as UpdateGoalData;
    expect(call.active).toBe(true);
    expect(call.deactivatedAt).toBeNull();
    expect(result.resumesOn).toBe('2026-11-16');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector_goal.reactivated',
        metadata: expect.objectContaining({ skippedPeriods: 2, resumesOn: '2026-11-16' }),
      }),
    );
  });

  it('refuses to reactivate a goal whose region was deleted', async () => {
    const { useCase } = useCaseWith(
      buildGoal({ metric: 'REGION_VOLUME', scopeRegionId: null, active: false, deactivatedAt: new Date() }),
    );
    await expect(
      useCase.execute({ goalId: 'goal-1', data: { active: true } as UpdateGoalInput, actor: am() }),
    ).rejects.toBeInstanceOf(GoalScopeRegionDeletedError);
  });

  it('rejects an endsAt inside the current period', async () => {
    const { useCase } = useCaseWith(buildGoal({ startsAt: '2026-11-09' }));
    await expect(
      useCase.execute({ goalId: 'goal-1', data: { endsAt: '2026-11-08' } as UpdateGoalInput, actor: am() }),
    ).rejects.toBeInstanceOf(GoalEndInCurrentPeriodError);
  });

  it('rejects a misaligned endsAt', async () => {
    const { useCase } = useCaseWith(buildGoal({ startsAt: '2026-11-09' }));
    await expect(
      useCase.execute({ goalId: 'goal-1', data: { endsAt: '2026-11-18' } as UpdateGoalInput, actor: am() }),
    ).rejects.toBeInstanceOf(GoalEndNotAlignedError);
  });

  it('is a no-op (200, no audit, no write) when nothing really changes', async () => {
    const { useCase, goalRepo } = useCaseWith(buildGoal({ title: 'Weekly volume' }));
    const result = await useCase.execute({
      goalId: 'goal-1',
      data: { title: 'Weekly volume' } as UpdateGoalInput,
      actor: am(),
    });
    expect(result.id).toBe('goal-1');
    expect(goalRepo.update).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('throws when the goal does not exist', async () => {
    const { useCase } = useCaseWith(null);
    await expect(
      useCase.execute({ goalId: 'missing', data: { title: 'x' } as UpdateGoalInput, actor: am() }),
    ).rejects.toBeInstanceOf(GoalNotFoundError);
  });
});

describe('ListGoalsUseCase', () => {
  it('returns the paginated, mapped goals', async () => {
    const goalRepo = makeGoalRepo();
    (goalRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [buildGoal()], total: 1 });
    const useCase = new ListGoalsUseCase(goalRepo, authorizationService, clock);

    const result = await useCase.execute({
      actor: am(),
      query: { active: true, page: 1, pageSize: 20, sortBy: 'createdAt', sortOrder: 'desc' },
    });
    expect(result.total).toBe(1);
    expect(result.data[0]!.id).toBe('goal-1');
  });

  it('forbids a non-AM/OP actor', async () => {
    const useCase = new ListGoalsUseCase(makeGoalRepo(), authorizationService, clock);
    await expect(
      useCase.execute({
        actor: am({ role: 'INSP', inspectorId: 'i1' }),
        query: { active: true, page: 1, pageSize: 20, sortBy: 'createdAt', sortOrder: 'desc' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('GetGoalUseCase', () => {
  it('returns the goal with its last closed period', async () => {
    const goalRepo = makeGoalRepo();
    (goalRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(buildGoal());
    const closureRepo = makeClosureRepo();
    (closureRepo.lastClosedByGoalId as ReturnType<typeof vi.fn>).mockResolvedValue({
      periodStart: '2026-11-02',
      periodEnd: '2026-11-08',
    });
    const useCase = new GetGoalUseCase(goalRepo, closureRepo, authorizationService, clock);

    const result = await useCase.execute({ goalId: 'goal-1', actor: am() });
    expect(result.lastClosedPeriod).toEqual({ start: '2026-11-02', end: '2026-11-08' });
  });

  it('throws when the goal does not exist', async () => {
    const goalRepo = makeGoalRepo();
    (goalRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new GetGoalUseCase(goalRepo, makeClosureRepo(), authorizationService, clock);
    await expect(useCase.execute({ goalId: 'missing', actor: am() })).rejects.toBeInstanceOf(GoalNotFoundError);
  });
});

describe('ListProgramPeriodsUseCase', () => {
  it('lists upcoming periods starting with the current one (IN_PROGRESS)', async () => {
    const useCase = new ListProgramPeriodsUseCase(authorizationService, clock);
    const result = await useCase.execute({
      actor: am(),
      query: { periodType: 'WEEKLY', direction: 'upcoming', count: 3 },
    });
    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toEqual({ start: '2026-11-09', end: '2026-11-15', status: 'IN_PROGRESS' });
    expect(result.data[1]).toEqual({ start: '2026-11-16', end: '2026-11-22', status: 'UPCOMING' });
  });

  it('lists past (closed) periods newest-first, excluding the current one', async () => {
    const useCase = new ListProgramPeriodsUseCase(authorizationService, clock);
    const result = await useCase.execute({
      actor: am(),
      query: { periodType: 'WEEKLY', direction: 'past', count: 2 },
    });
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual({ start: '2026-11-02', end: '2026-11-08', status: 'CLOSED' });
    expect(result.data[1]).toEqual({ start: '2026-10-26', end: '2026-11-01', status: 'CLOSED' });
  });

  it('forbids a non-AM/OP actor', async () => {
    const useCase = new ListProgramPeriodsUseCase(authorizationService, clock);
    await expect(
      useCase.execute({ actor: am({ role: 'CL_USER', tenantId: 't1' }), query: { periodType: 'WEEKLY', direction: 'past', count: 2 } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
