/**
 * Q12 (F08-6): the INSPECTOR_BONUS ledger against a real PostgreSQL database — the CHECK
 * constraints and partial indexes the unit tests cannot prove, plus the IBonusEntryWriter and the
 * bonus-aware invoice readers.
 *
 * Requires Docker (testcontainers). Run via: `pnpm --filter backend test:integration:db`
 */

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaFinancialEntryRepository } from '../../../src/modules/billing/infrastructure/prisma-financial-entry.repository';
import { BonusReversalAlreadyExistsError } from '../../../src/modules/billing/domain/billing.errors';

let harness: DbHarness | undefined;
let prisma: PrismaClient;
let repo: PrismaFinancialEntryRepository;
let tenantId: string;
let userId: string;
let inspectorId: string;

const rnd = () => Math.random().toString(36).slice(2, 10);
const d = (civil: string) => new Date(`${civil}T00:00:00.000Z`);

async function createReward(overrides: Record<string, unknown> = {}): Promise<string> {
  const goal = await prisma.inspectorGoal.create({
    data: { title: 'Weekly volume', metric: 'VOLUME', comparator: 'GTE', target: 10, period: 'WEEKLY', reward_amount: 30, starts_at: d('2026-11-02'), created_by_user_id: userId },
  });
  const reward = await prisma.rewardAward.create({
    data: {
      goal_id: goal.id, inspector_id: inspectorId, period_type: 'WEEKLY', period_start: d('2026-11-02'), period_end: d('2026-11-08'),
      goal_title: 'Weekly volume', metric: 'VOLUME', comparator: 'GTE', target: 10, amount: 30,
      achieved_value: 12, service_count: 12, achieved_on: d('2026-11-08'),
      status: 'APPROVED', approved_by_user_id: userId, approved_at: new Date('2026-11-10T01:00:00.000Z'),
      ...overrides,
    },
  });
  return reward.id;
}

// A raw bonus-entry insert (typed loosely so CHECK/constraint violations reach the DB).
function createEntry(data: Record<string, unknown>) {
  return prisma.financialEntry.create({
    data: { currency: 'AUD', status: 'APPROVED', description: 'x', effective_at: d('2026-11-10'), ...data } as never,
  });
}

beforeAll(async () => {
  harness = await setupDbHarness();
  prisma = harness.prisma;
  repo = new PrismaFinancialEntryRepository(prisma);
  const tenant = await prisma.tenant.create({ data: { name: `T ${rnd()}`, legal_name: `T ${rnd()}`, status: 'ACTIVE', currency: 'AUD' } });
  tenantId = tenant.id;
  const branch = await prisma.branch.create({ data: { tenant_id: tenant.id, name: 'B', status: 'ACTIVE' } });
  const user = await prisma.user.create({
    data: { tenant_id: tenant.id, branch_id: branch.id, role: 'OP', name: 'Op', email: `op-${rnd()}@t.local`, password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE' },
  });
  userId = user.id;
  const inspector = await prisma.inspector.create({ data: { name: 'Insp', email: `i-${rnd()}@t.local`, status: 'ACTIVE' } });
  inspectorId = inspector.id;
}, 180_000);

afterAll(async () => { await teardownDbHarness(harness); });

describe('financial_entries bonus CHECK constraints', () => {
  it('rejects an INSPECTOR_BONUS with a tenant_id', async () => {
    const rewardId = await createReward();
    await expect(createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: tenantId, inspector_id: inspectorId, amount: '30.00', reward_award_id: rewardId })).rejects.toThrow();
  });

  it('rejects a legacy type (TENANT_DEBIT) with a NULL tenant_id', async () => {
    await expect(createEntry({ entry_type: 'TENANT_DEBIT', tenant_id: null, amount: '30.00' })).rejects.toThrow();
  });

  it('rejects an INSPECTOR_BONUS without an inspector_id', async () => {
    const rewardId = await createReward();
    await expect(createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: null, amount: '30.00', reward_award_id: rewardId })).rejects.toThrow();
  });

  it('rejects an original bonus with amount <= 0', async () => {
    const rewardId = await createReward();
    await expect(createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: inspectorId, amount: '0.00', reward_award_id: rewardId })).rejects.toThrow();
  });

  it('rejects a bonus carrying BOTH reward_award_id and reference_entry_id', async () => {
    const rewardId = await createReward();
    const original = await createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: inspectorId, amount: '30.00', reward_award_id: rewardId });
    const otherReward = await createReward();
    await expect(
      createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: inspectorId, amount: '30.00', reward_award_id: otherReward, reference_entry_id: original.id }),
    ).rejects.toThrow();
  });

  it('rejects a reversal (reference_entry_id) with amount >= 0', async () => {
    const rewardId = await createReward();
    const original = await createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: inspectorId, amount: '30.00', reward_award_id: rewardId });
    await expect(
      createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: inspectorId, amount: '30.00', reference_entry_id: original.id }),
    ).rejects.toThrow();
  });

  it('rejects reward_award_id on a non-bonus type', async () => {
    const rewardId = await createReward();
    await expect(createEntry({ entry_type: 'MANUAL_ADJUSTMENT', tenant_id: tenantId, amount: '30.00', reward_award_id: rewardId })).rejects.toThrow();
  });

  it('enforces UNIQUE (reward_award_id)', async () => {
    const rewardId = await createReward();
    await createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: inspectorId, amount: '30.00', reward_award_id: rewardId });
    await expect(
      createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: inspectorId, amount: '30.00', reward_award_id: rewardId }),
    ).rejects.toThrow();
  });

  it('enforces the partial unique reversal index (one reversal per original)', async () => {
    const rewardId = await createReward();
    const original = await createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: inspectorId, amount: '30.00', reward_award_id: rewardId });
    await createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: inspectorId, amount: '-30.00', reference_entry_id: original.id });
    await expect(
      createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: inspectorId, amount: '-30.00', reference_entry_id: original.id }),
    ).rejects.toThrow();
  });
});

describe('reward_awards invoice-link constraints', () => {
  it('rejects a PAID reward without an invoice link', async () => {
    await expect(createReward({ status: 'PAID', paid_at: new Date('2026-11-20T00:00:00.000Z') })).rejects.toThrow();
  });

  it('rejects an inspector_invoice_id that does not exist (FK Restrict)', async () => {
    await expect(createReward({ inspector_invoice_id: '00000000-0000-0000-0000-000000000000' })).rejects.toThrow();
  });
});

describe('IBonusEntryWriter + bonus-aware readers', () => {
  it('createApprovedBonus mints an APPROVED, tenantless, inspector-scoped entry', async () => {
    const rewardId = await createReward();
    const entryId = await prisma.$transaction((tx) =>
      repo.createApprovedBonus(tx, {
        rewardAwardId: rewardId, inspectorId, amount: 30, currency: 'AUD',
        approvedByUserId: userId, approvedAt: new Date('2026-11-10T01:00:00.000Z'), effectiveAt: new Date('2026-11-10T01:00:00.000Z'),
        description: 'Bonus: Weekly volume · Week of Mon 2 Nov',
      }),
    );
    const row = await prisma.financialEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(row.entry_type).toBe('INSPECTOR_BONUS');
    expect(row.tenant_id).toBeNull();
    expect(row.inspector_id).toBe(inspectorId);
    expect(row.reward_award_id).toBe(rewardId);
    expect(row.initiated_by_user_id).toBeNull();
    expect(Number(row.amount)).toBe(30);
    expect(row.status).toBe('APPROVED');
  });

  it('a second reversal of the same original maps the raw 23505 to a 409', async () => {
    const rewardId = await createReward();
    const original = await createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: inspectorId, amount: '30.00', reward_award_id: rewardId });
    await prisma.$transaction((tx) => repo.createReversalForReward(tx, { rewardAwardId: rewardId, approvedByUserId: userId, effectiveAt: new Date(), description: 'Bonus reversal' }));
    await expect(
      prisma.$transaction((tx) => repo.createReversalForReward(tx, { rewardAwardId: rewardId, approvedByUserId: userId, effectiveAt: new Date(), description: 'Bonus reversal' })),
    ).rejects.toBeInstanceOf(BonusReversalAlreadyExistsError);
    // Original is still present, unvoided.
    const stillThere = await prisma.financialEntry.findUniqueOrThrow({ where: { id: original.id } });
    expect(stillThere.status).toBe('APPROVED');
  });

  it('snapshot/aggregate/summary include an approved bonus, exclude a voided one', async () => {
    const rewardId = await createReward();
    const bonus = await createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: inspectorId, amount: '30.00', reward_award_id: rewardId, effective_at: d('2026-11-10') });

    const { lines } = await repo.findApprovedPayoutLinesForSnapshot(inspectorId, d('2026-11-09'), d('2026-11-16'));
    const bonusLine = lines.find((l) => l.kind === 'BONUS' && l.entryId === bonus.id);
    expect(bonusLine).toBeDefined();
    expect(bonusLine!.appointmentId).toBeNull();
    expect(bonusLine!.rewardAwardId).toBe(rewardId);
    expect(bonusLine!.amount).toBe(30);

    const agg = await repo.aggregateApprovedPayoutsForInspectorInPeriod(inspectorId, d('2026-11-09'), d('2026-11-16'));
    expect(agg.totalAmount).toBeGreaterThanOrEqual(30);
    expect(agg.count).toBeGreaterThanOrEqual(1);

    // Void the bonus → it drops out of the snapshot.
    await prisma.financialEntry.update({ where: { id: bonus.id }, data: { status: 'VOIDED' } });
    const after = await repo.findApprovedPayoutLinesForSnapshot(inspectorId, d('2026-11-09'), d('2026-11-16'));
    expect(after.lines.some((l) => l.entryId === bonus.id)).toBe(false);
  });

  it('getSummary reports totalBonuses separately for AM', async () => {
    const rewardId = await createReward();
    await createEntry({ entry_type: 'INSPECTOR_BONUS', tenant_id: null, inspector_id: inspectorId, amount: '30.00', reward_award_id: rewardId, effective_at: d('2026-12-01') });
    const summary = await repo.getSummary();
    expect(summary.totalBonuses).toBeGreaterThanOrEqual(30);
  });
});
