import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import type { RewardAward } from '../domain/reward-award.entity';
import type { IBonusEntryWriter } from '../domain/bonus-entry-writer.port';
import { BonusLedgerHook } from './bonus-ledger.hook';

const NOW = new Date('2026-11-10T01:00:00.000Z');
const tx = {} as Prisma.TransactionClient;

function award(overrides: Partial<RewardAward> = {}): RewardAward {
  return {
    id: 'award-1',
    goalId: 'goal-1',
    inspectorId: 'insp-1',
    periodType: 'WEEKLY',
    periodStart: '2026-11-02',
    periodEnd: '2026-11-08',
    goalTitle: 'Weekly volume',
    metric: 'VOLUME',
    comparator: 'GTE',
    target: 10,
    amount: 30,
    scopeLabel: null,
    achievedValue: 12,
    serviceCount: 12,
    achievedOn: '2026-11-06',
    indexScoreAtClose: 88.3,
    levelAtClose: 'GOLD',
    indexSnapshotDate: '2026-11-08',
    status: 'APPROVED',
    approvedByUserId: 'op-1',
    approvedAt: NOW,
    paidAt: null,
    voidedByUserId: null,
    voidedAt: null,
    voidReason: null,
    inspectorNote: null,
    inspectorInvoiceId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function writer(): IBonusEntryWriter {
  return {
    createApprovedBonus: vi.fn(async () => 'entry-1'),
    voidBonusForReward: vi.fn(async () => undefined),
    createReversalForReward: vi.fn(async () => undefined),
  };
}

describe('BonusLedgerHook', () => {
  it('onApproved creates the original bonus entry with the frozen description', async () => {
    const w = writer();
    await new BonusLedgerHook(w).onApproved(award(), { tx, actorUserId: 'op-1', now: NOW });
    expect(w.createApprovedBonus).toHaveBeenCalledWith(tx, {
      rewardAwardId: 'award-1',
      inspectorId: 'insp-1',
      amount: 30,
      currency: 'AUD',
      approvedByUserId: 'op-1',
      approvedAt: NOW,
      effectiveAt: NOW,
      description: 'Bonus: Weekly volume · Week of Mon 2 Nov',
    });
    expect(w.voidBonusForReward).not.toHaveBeenCalled();
    expect(w.createReversalForReward).not.toHaveBeenCalled();
  });

  it('onVoided of a NOT-invoiced reward voids the original entry', async () => {
    const w = writer();
    await new BonusLedgerHook(w).onVoided(
      award({ status: 'VOID', inspectorInvoiceId: null, voidReason: 'mistake' }),
      { tx, actorUserId: 'am-1', now: NOW },
    );
    expect(w.voidBonusForReward).toHaveBeenCalledWith(tx, {
      rewardAwardId: 'award-1',
      voidedByUserId: 'am-1',
      voidedAt: NOW,
      voidReason: 'mistake',
    });
    expect(w.createReversalForReward).not.toHaveBeenCalled();
  });

  it('onVoided of an INVOICED reward creates a reversal', async () => {
    const w = writer();
    await new BonusLedgerHook(w).onVoided(
      award({ status: 'VOID', inspectorInvoiceId: 'inv-1' }),
      { tx, actorUserId: 'am-1', now: NOW },
    );
    expect(w.createReversalForReward).toHaveBeenCalledWith(tx, {
      rewardAwardId: 'award-1',
      approvedByUserId: 'am-1',
      effectiveAt: NOW,
      description: 'Bonus reversal: Weekly volume · Week of Mon 2 Nov',
    });
    expect(w.voidBonusForReward).not.toHaveBeenCalled();
  });

  it('throws when invoked without a transaction (wiring bug)', async () => {
    const w = writer();
    await expect(
      new BonusLedgerHook(w).onApproved(award(), { actorUserId: 'op-1', now: NOW }),
    ).rejects.toThrow(/transaction/i);
    expect(w.createApprovedBonus).not.toHaveBeenCalled();
  });
});
