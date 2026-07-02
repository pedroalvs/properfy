import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaFinancialEntryRepository } from '../../../src/modules/billing/infrastructure/prisma-financial-entry.repository';

describe('PrismaFinancialEntryRepository.getSummary', () => {
  const groupBy = vi.fn();
  const count = vi.fn();

  const prisma = {
    financialEntry: {
      groupBy,
      count,
    },
  };

  let repository: PrismaFinancialEntryRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaFinancialEntryRepository(prisma as never);
  });

  it('aggregates totals from APPROVED entries only and keeps pending count separate', async () => {
    groupBy.mockResolvedValue([
      { entry_type: 'TENANT_DEBIT', _sum: { amount: 5000 } },
      { entry_type: 'INSPECTOR_PAYOUT', _sum: { amount: 3000 } },
      { entry_type: 'MANUAL_ADJUSTMENT', _sum: { amount: 200 } },
      { entry_type: 'REFUND', _sum: { amount: 150 } },
    ]);
    count.mockResolvedValue(7);

    const result = await repository.getSummary('tenant-1');

    expect(groupBy).toHaveBeenCalledWith({
      by: ['entry_type'],
      where: { tenant_id: 'tenant-1', status: 'APPROVED' },
      _sum: { amount: true },
    });
    expect(count).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-1', status: 'PENDING' },
    });
    expect(result).toEqual({
      totalDebits: 5000,
      totalPayouts: 3000,
      totalAdjustments: 200,
      totalRefunds: 150,
      pendingCount: 7,
      currency: null,
    });
  });
});

describe('PrismaFinancialEntryRepository buildWhere — entryTypeIn (031)', () => {
  const count = vi.fn();
  const prisma = { financialEntry: { count } };
  let repository: PrismaFinancialEntryRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaFinancialEntryRepository(prisma as never);
  });

  it('translates entryTypeIn into a WHERE entry_type IN (...) clause', async () => {
    count.mockResolvedValue(3);
    await repository.count({
      tenantId: 'tenant-1',
      entryTypeIn: ['TENANT_DEBIT', 'REFUND', 'MANUAL_ADJUSTMENT'],
    });
    expect(count).toHaveBeenCalledWith({
      where: {
        tenant_id: 'tenant-1',
        entry_type: { in: ['TENANT_DEBIT', 'REFUND', 'MANUAL_ADJUSTMENT'] },
      },
    });
  });

  it('a specific entryType takes precedence over entryTypeIn', async () => {
    count.mockResolvedValue(1);
    await repository.count({
      tenantId: 'tenant-1',
      entryType: 'TENANT_DEBIT',
      entryTypeIn: ['TENANT_DEBIT', 'REFUND', 'MANUAL_ADJUSTMENT'],
    });
    expect(count).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-1', entry_type: 'TENANT_DEBIT' },
    });
  });
});
