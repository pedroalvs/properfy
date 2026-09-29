import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { backfillFinancialEntriesOnDone, isDirectInvocation } from './backfill-financial-entries-on-done';

function makePrisma(candidateIds: string[]) {
  const findMany = vi.fn().mockResolvedValue(candidateIds.map((id) => ({ id })));
  return {
    prisma: { appointment: { findMany } } as unknown as PrismaClient,
    findMany,
  };
}

describe('backfillFinancialEntriesOnDone', () => {
  it('dry run reports candidates but writes nothing', async () => {
    const { prisma } = makePrisma(['appt-1', 'appt-2']);
    const useCase = { execute: vi.fn() };

    const summary = await backfillFinancialEntriesOnDone(prisma, useCase, { apply: false });

    expect(summary.dryRun).toBe(true);
    expect(summary.scanned).toBe(2);
    expect(summary.appointmentsRepaired).toBe(0);
    expect(summary.entriesCreated).toBe(0);
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('apply creates entries for each candidate and tallies both legs', async () => {
    const { prisma } = makePrisma(['appt-1', 'appt-2']);
    const useCase = {
      execute: vi.fn().mockResolvedValue({ debitEntryId: 'd', payoutEntryId: 'p' }),
    };

    const summary = await backfillFinancialEntriesOnDone(prisma, useCase, { apply: true });

    expect(useCase.execute).toHaveBeenCalledTimes(2);
    expect(useCase.execute).toHaveBeenCalledWith({ appointmentId: 'appt-1' });
    expect(summary.appointmentsRepaired).toBe(2);
    expect(summary.entriesCreated).toBe(4); // debit + payout per appointment
    expect(summary.failures).toEqual([]);
  });

  it('records a per-appointment failure and continues with the rest', async () => {
    const { prisma } = makePrisma(['appt-1', 'appt-2']);
    const useCase = {
      execute: vi
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ debitEntryId: 'd', payoutEntryId: 'p' }),
    };

    const summary = await backfillFinancialEntriesOnDone(prisma, useCase, { apply: true });

    expect(summary.appointmentsRepaired).toBe(1);
    expect(summary.entriesCreated).toBe(2);
    expect(summary.failures).toEqual([{ appointmentId: 'appt-1', message: 'boom' }]);
  });

  it('scopes the query to one tenant when --tenant-id is given', async () => {
    const { prisma, findMany } = makePrisma([]);
    const useCase = { execute: vi.fn() };

    await backfillFinancialEntriesOnDone(prisma, useCase, { apply: false, tenantId: 'tenant-9' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'DONE',
          done_checked_by_user_id: { not: null },
          deleted_at: null,
          financial_entries: { none: {} },
          tenant_id: 'tenant-9',
        }),
      }),
    );
  });
});

describe('backfill-financial-entries-on-done entrypoint guard', () => {
  it('runs as the bundled production entrypoint', () => {
    expect(isDirectInvocation('/app/apps/backend/dist/backfill-financial-entries-on-done.js')).toBe(true);
  });

  it('runs from the TypeScript source', () => {
    expect(isDirectInvocation('/repo/apps/backend/src/scripts/backfill-financial-entries-on-done.ts')).toBe(true);
  });

  it('stays inert when merely imported', () => {
    expect(isDirectInvocation('/repo/node_modules/vitest/vitest.mjs')).toBe(false);
    expect(isDirectInvocation(undefined)).toBe(false);
  });

  it('does not match a lookalike filename', () => {
    expect(isDirectInvocation('/app/dist/backfill-financial-entries-on-done-v2.js')).toBe(false);
    expect(isDirectInvocation('/app/dist/my-backfill-financial-entries-on-done.js')).toBe(false);
  });
});
