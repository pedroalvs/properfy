/**
 * Inspector program persistence against a real PostgreSQL database (F08-1 tests
 * 17). Proves the DB-level invariants the unit tests cannot: the CHECK
 * constraints, the (goal, inspector, period) / (goal, period) uniques with
 * `createMany skipDuplicates`, the approve/void CAS, `findParticipations`, the
 * `index_snapshot_date` round-trip, and `onDelete: SetNull` for a deleted region.
 *
 * Requires Docker (testcontainers). Run via: `pnpm --filter backend test:integration:db`
 */

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaGoalRepository } from '../../../src/modules/inspector-program/infrastructure/prisma-goal.repository';
import { PrismaRewardAwardRepository } from '../../../src/modules/inspector-program/infrastructure/prisma-reward-award.repository';
import { PrismaGoalPeriodClosureRepository } from '../../../src/modules/inspector-program/infrastructure/prisma-goal-period-closure.repository';

let harness: DbHarness | undefined;
let prisma: PrismaClient;
let goalRepo: PrismaGoalRepository;
let rewardRepo: PrismaRewardAwardRepository;
let closureRepo: PrismaGoalPeriodClosureRepository;
let userId: string;
let inspectorId: string;

const suffix = (): string => Math.random().toString(36).slice(2, 10);
const d = (civil: string) => new Date(`${civil}T00:00:00.000Z`);

async function createGoalRow(overrides: Record<string, unknown> = {}): Promise<string> {
  const goal = await prisma.inspectorGoal.create({
    data: {
      title: 'Goal',
      metric: 'VOLUME',
      comparator: 'GTE',
      target: 10,
      period: 'WEEKLY',
      reward_amount: 30,
      starts_at: d('2026-11-02'),
      created_by_user_id: userId,
      ...overrides,
    },
  });
  return goal.id;
}

beforeAll(async () => {
  harness = await setupDbHarness();
  prisma = harness.prisma;
  goalRepo = new PrismaGoalRepository(prisma);
  rewardRepo = new PrismaRewardAwardRepository(prisma);
  closureRepo = new PrismaGoalPeriodClosureRepository(prisma);

  const tenant = await prisma.tenant.create({ data: { name: `T${suffix()}`, legal_name: `T ${suffix()}`, status: 'ACTIVE' } });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id, role: 'OP', name: 'Op', email: `op-${suffix()}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  userId = user.id;
  const inspector = await prisma.inspector.create({
    data: { name: 'Insp', email: `insp-${suffix()}@test.local`, status: 'ACTIVE' },
  });
  inspectorId = inspector.id;
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

describe('inspector_goals CHECK constraints', () => {
  it('rejects an active REGION_VOLUME goal without a region', async () => {
    await expect(createGoalRow({ metric: 'REGION_VOLUME', active: true })).rejects.toThrow();
  });
  it('allows an inactive REGION_VOLUME goal without a region', async () => {
    await expect(
      createGoalRow({ metric: 'REGION_VOLUME', active: false, deactivated_at: new Date() }),
    ).resolves.toBeTruthy();
  });
  it('rejects ends_at before starts_at', async () => {
    await expect(createGoalRow({ ends_at: d('2026-11-01') })).rejects.toThrow();
  });
  it('rejects CANT_DO_MAX with a GTE comparator', async () => {
    await expect(createGoalRow({ metric: 'CANT_DO_MAX', comparator: 'GTE' })).rejects.toThrow();
  });
  it('rejects active=true with a deactivated_at set', async () => {
    await expect(createGoalRow({ active: true, deactivated_at: new Date() })).rejects.toThrow();
  });
  it('rejects next_target without next_effective_from', async () => {
    await expect(createGoalRow({ next_target: 12 })).rejects.toThrow();
  });
});

describe('reward_awards CHECK constraints', () => {
  async function createAward(overrides: Record<string, unknown>): Promise<unknown> {
    const goalId = await createGoalRow();
    return prisma.rewardAward.create({
      data: {
        goal_id: goalId,
        inspector_id: inspectorId,
        period_type: 'WEEKLY',
        period_start: d('2026-11-02'),
        period_end: d('2026-11-08'),
        goal_title: 'Goal',
        metric: 'VOLUME',
        comparator: 'GTE',
        target: 10,
        amount: 30,
        achieved_value: 12,
        service_count: 12,
        achieved_on: d('2026-11-08'),
        ...overrides,
      },
    });
  }

  it('rejects APPROVED without approved_by', async () => {
    await expect(createAward({ status: 'APPROVED' })).rejects.toThrow();
  });
  it('rejects PAID without paid_at', async () => {
    await expect(createAward({ status: 'PAID', approved_by_user_id: userId })).rejects.toThrow();
  });
  it('rejects PENDING with a paid_at', async () => {
    await expect(createAward({ status: 'PENDING', paid_at: new Date() })).rejects.toThrow();
  });
  it('allows VOID carrying paid_at + approved_by (void-after-paid, TASK-F08-6)', async () => {
    await expect(
      createAward({
        status: 'VOID',
        approved_by_user_id: userId,
        paid_at: new Date(),
        voided_by_user_id: userId,
        voided_at: new Date(),
        void_reason: 'Reversed after payment',
      }),
    ).resolves.toBeTruthy();
  });
});

describe('uniques + skipDuplicates', () => {
  it('ignores a duplicate award (goal, inspector, period) and a duplicate closure (goal, period)', async () => {
    const goalId = await createGoalRow();
    const award = {
      goalId,
      inspectorId,
      periodType: 'WEEKLY' as const,
      periodStart: '2026-11-02',
      periodEnd: '2026-11-08',
      goalTitle: 'Goal',
      metric: 'VOLUME' as const,
      comparator: 'GTE' as const,
      target: 10,
      amount: 30,
      scopeLabel: null,
      achievedValue: 12,
      serviceCount: 12,
      achievedOn: '2026-11-08',
      indexScoreAtClose: 88,
      levelAtClose: 'GOLD' as const,
      indexSnapshotDate: '2026-11-08',
    };
    expect((await rewardRepo.insertManySkipDuplicates([award])).count).toBe(1);
    expect((await rewardRepo.insertManySkipDuplicates([award])).count).toBe(0);

    const closure = {
      goalId,
      periodType: 'WEEKLY' as const,
      periodStart: '2026-11-02',
      periodEnd: '2026-11-08',
      participantIds: [inspectorId],
      participantsCount: 1,
      achieversCount: 1,
      promisedAmount: 30,
      scopeLabel: null,
      indexSnapshotDate: null,
      trigger: 'SCHEDULED' as const,
      closedAt: new Date(),
    };
    expect((await closureRepo.insertManySkipDuplicates([closure])).count).toBe(1);
    expect((await closureRepo.insertManySkipDuplicates([closure])).count).toBe(0);

    // index_snapshot_date round-trips (date + null)
    const stored = await rewardRepo.findByGoalPeriod(goalId, '2026-11-02');
    expect(stored[0]?.indexSnapshotDate).toBe('2026-11-08');
    expect(stored[0]?.levelAtClose).toBe('GOLD');
  });
});

describe('approve/void CAS', () => {
  it('approvePending succeeds once then loses the race (0 rows)', async () => {
    const goalId = await createGoalRow();
    await rewardRepo.insertManySkipDuplicates([
      {
        goalId, inspectorId, periodType: 'WEEKLY', periodStart: '2026-11-09', periodEnd: '2026-11-15',
        goalTitle: 'Goal', metric: 'VOLUME', comparator: 'GTE', target: 10, amount: 30, scopeLabel: null,
        achievedValue: 12, serviceCount: 12, achievedOn: '2026-11-15', indexScoreAtClose: null, levelAtClose: null, indexSnapshotDate: null,
      },
    ]);
    const [award] = await rewardRepo.findByGoalPeriod(goalId, '2026-11-09');
    expect(await rewardRepo.approvePending(award!.id, userId, new Date())).toBe(1);
    expect(await rewardRepo.approvePending(award!.id, userId, new Date())).toBe(0);
    expect(await rewardRepo.voidPendingOrApproved(award!.id, userId, new Date(), 'done', null)).toBe(1);
    expect(await rewardRepo.voidPendingOrApproved(award!.id, userId, new Date(), 'again', null)).toBe(0);
  });
});

describe('findParticipations + region SetNull', () => {
  it('reports participations with awarded=true only for non-void awards', async () => {
    const goalId = await createGoalRow();
    await closureRepo.insertManySkipDuplicates([
      {
        goalId, periodType: 'WEEKLY', periodStart: '2026-11-16', periodEnd: '2026-11-22',
        participantIds: [inspectorId], participantsCount: 1, achieversCount: 1, promisedAmount: 30,
        scopeLabel: null, indexSnapshotDate: null, trigger: 'SCHEDULED', closedAt: new Date(),
      },
    ]);
    await rewardRepo.insertManySkipDuplicates([
      {
        goalId, inspectorId, periodType: 'WEEKLY', periodStart: '2026-11-16', periodEnd: '2026-11-22',
        goalTitle: 'Goal', metric: 'VOLUME', comparator: 'GTE', target: 10, amount: 30, scopeLabel: null,
        achievedValue: 12, serviceCount: 12, achievedOn: '2026-11-22', indexScoreAtClose: null, levelAtClose: null, indexSnapshotDate: null,
      },
    ]);
    const participations = await closureRepo.findParticipations(inspectorId);
    const row = participations.find((p) => p.periodStart === '2026-11-16');
    expect(row).toMatchObject({ goalPeriodType: 'WEEKLY', awarded: true });
  });

  it('nulls scope_region_id when a region used only by an inactive goal is deleted', async () => {
    const tenant = await prisma.tenant.create({ data: { name: `R${suffix()}`, legal_name: `R ${suffix()}`, status: 'ACTIVE' } });
    const region = await prisma.serviceRegion.create({ data: { tenant_id: tenant.id, name: `Region ${suffix()}` } });
    const goalId = await createGoalRow({
      metric: 'REGION_VOLUME',
      scope_region_id: region.id,
      active: false,
      deactivated_at: new Date(),
    });
    await prisma.serviceRegion.delete({ where: { id: region.id } });
    const goal = await goalRepo.findById(goalId);
    expect(goal?.scopeRegionId).toBeNull();
  });
});
