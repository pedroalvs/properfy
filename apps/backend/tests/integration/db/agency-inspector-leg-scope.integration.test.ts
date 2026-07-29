/**
 * Agency financial reads must never expose the platform↔inspector leg — real
 * database verification.
 *
 * 031 states the rule ("INSPECTOR_PAYOUT is deliberately excluded — it is the
 * platform↔inspector leg"), but it was only enforced on the extrato list. Three
 * sibling surfaces did not honour it:
 *
 *   1. `GET /v1/financial/entries/{id}` scoped CL roles by tenant only, so an
 *      agency could read an own-tenant INSPECTOR_PAYOUT — amount, inspector name
 *      and all — by its id.
 *   2. The summary zeroed `totalPayouts` *after* the query. Every other aggregate
 *      came from the same groupBy, so `totalAdjustments` still summed
 *      inspector-scoped adjustments and `pendingCount` still counted pending
 *      payouts.
 *   3. The list and the XLSX export admitted MANUAL_ADJUSTMENT wholesale, so an
 *      inspector-scoped adjustment (which passes the entry-type allowlist but is
 *      still the inspector leg) appeared in both.
 *
 * These are all WHERE-clause behaviours: a mocked repository returns its stub
 * regardless of the predicate and would hide every one of them. Hence a real
 * PostgreSQL database.
 *
 * Fixture (one tenant): TENANT_DEBIT 100 (agency-visible), REFUND 20
 * (agency-visible), MANUAL_ADJUSTMENT 10 with no inspector (agency-visible),
 * INSPECTOR_PAYOUT 80 (inspector leg), MANUAL_ADJUSTMENT 15 scoped to the
 * inspector (inspector leg), plus one PENDING INSPECTOR_PAYOUT to prove
 * `pendingCount` is scoped too.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { ListFinancialEntriesUseCase } from '../../../src/modules/billing/application/use-cases/list-financial-entries.use-case';
import { GetFinancialEntryUseCase } from '../../../src/modules/billing/application/use-cases/get-financial-entry.use-case';
import { GetFinancialSummaryUseCase } from '../../../src/modules/billing/application/use-cases/get-financial-summary.use-case';
import { PrismaFinancialEntryRepository } from '../../../src/modules/billing/infrastructure/prisma-financial-entry.repository';
import { PrismaTenantRepository } from '../../../src/modules/tenant/infrastructure/prisma-tenant.repository';
import { EntryNotFoundError } from '../../../src/modules/billing/domain/billing.errors';
import type { AuditService } from '../../../src/shared/infrastructure/audit';

const rnd = () => Math.random().toString(36).slice(2, 10);

function silentAuditService() {
  return { log: () => {} } as unknown as AuditService;
}

function clAdminActor(tenantId: string): AuthContext {
  return { userId: 'cl-admin-actor', tenantId, role: 'CL_ADMIN', branchId: null, inspectorId: null };
}

function amActor(): AuthContext {
  return { userId: 'am-actor', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
}

const listInput = (actor: AuthContext) => ({
  page: 1,
  pageSize: 50,
  sortBy: 'effective_at',
  sortOrder: 'desc' as const,
  actor,
});

describe('Agency financial reads exclude the inspector leg (real DB)', () => {
  let harness: DbHarness | undefined;
  let tenantId: string;
  let payoutEntryId: string;
  let inspectorAdjustmentId: string;
  let tenantDebitId: string;
  let listUseCase: ListFinancialEntriesUseCase;
  let getUseCase: GetFinancialEntryUseCase;
  let summaryUseCase: GetFinancialSummaryUseCase;

  beforeAll(async () => {
    harness = await setupDbHarness();
    const { prisma } = harness;

    const tenant = await prisma.tenant.create({
      data: {
        name: 'Agency Leg Scope Tenant',
        legal_name: `Agency Leg Scope LLC ${rnd()}`,
        status: 'ACTIVE',
        currency: 'AUD',
      },
    });
    tenantId = tenant.id;

    const branch = await prisma.branch.create({
      data: { tenant_id: tenant.id, name: 'Main Branch', status: 'ACTIVE' },
    });
    const user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branch.id,
        role: 'OP',
        name: 'Fixture Actor',
        email: `fixture-${rnd()}@test.local`,
        password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
        status: 'ACTIVE',
      },
    });
    const inspector = await prisma.inspector.create({
      data: { name: 'Fixture Inspector', email: `inspector-${rnd()}@test.local`, status: 'ACTIVE' },
    });

    const entry = (data: Record<string, unknown>) =>
      prisma.financialEntry.create({
        data: {
          tenant_id: tenant.id,
          currency: 'AUD',
          status: 'APPROVED',
          description: 'fixture',
          initiated_by_user_id: user.id,
          effective_at: new Date('2026-05-10T00:00:00.000Z'),
          ...data,
        } as never,
      });

    tenantDebitId = (await entry({ entry_type: 'TENANT_DEBIT', amount: '100.00' })).id;
    await entry({ entry_type: 'REFUND', amount: '20.00' });
    await entry({ entry_type: 'MANUAL_ADJUSTMENT', amount: '10.00' });
    payoutEntryId = (await entry({ entry_type: 'INSPECTOR_PAYOUT', amount: '80.00', inspector_id: inspector.id })).id;
    inspectorAdjustmentId = (
      await entry({ entry_type: 'MANUAL_ADJUSTMENT', amount: '15.00', inspector_id: inspector.id })
    ).id;
    // Pending payout — proves `pendingCount` is scoped, not only the approved sums.
    await entry({ entry_type: 'INSPECTOR_PAYOUT', amount: '40.00', inspector_id: inspector.id, status: 'PENDING' });

    const entryRepo = new PrismaFinancialEntryRepository(prisma);
    const tenantRepo = new PrismaTenantRepository(prisma);
    listUseCase = new ListFinancialEntriesUseCase(entryRepo, silentAuditService());
    getUseCase = new GetFinancialEntryUseCase(entryRepo);
    summaryUseCase = new GetFinancialSummaryUseCase(entryRepo, tenantRepo);
  }, 180_000);

  afterAll(async () => {
    if (harness) await teardownDbHarness(harness);
  });

  it('lists only the three agency-visible entries for CL_ADMIN', async () => {
    const result = await listUseCase.execute(listInput(clAdminActor(tenantId)));

    expect(result.total).toBe(3);
    const types = result.data.map((e) => e.entryType).sort();
    expect(types).toEqual(['MANUAL_ADJUSTMENT', 'REFUND', 'TENANT_DEBIT']);
    expect(result.data.every((e) => e.inspectorId === null)).toBe(true);
  });

  it('excludes the inspector-scoped adjustment even when CL_ADMIN filters by MANUAL_ADJUSTMENT', async () => {
    const result = await listUseCase.execute({
      ...listInput(clAdminActor(tenantId)),
      type: 'MANUAL_ADJUSTMENT',
    });

    expect(result.total).toBe(1);
    expect(result.data[0]!.inspectorId).toBeNull();
    expect(Number(result.data[0]!.amount)).toBe(10);
  });

  it('still shows the whole ledger to AM', async () => {
    const result = await listUseCase.execute(listInput(amActor()));
    // 5 approved + 1 pending
    expect(result.total).toBe(6);
  });

  it('refuses to return an own-tenant INSPECTOR_PAYOUT to CL_ADMIN by id', async () => {
    await expect(
      getUseCase.execute({ entryId: payoutEntryId, actor: clAdminActor(tenantId) }),
    ).rejects.toThrow(EntryNotFoundError);
  });

  it('refuses to return an inspector-scoped MANUAL_ADJUSTMENT to CL_ADMIN by id', async () => {
    await expect(
      getUseCase.execute({ entryId: inspectorAdjustmentId, actor: clAdminActor(tenantId) }),
    ).rejects.toThrow(EntryNotFoundError);
  });

  it('still returns an agency-visible entry to CL_ADMIN by id', async () => {
    const result = await getUseCase.execute({ entryId: tenantDebitId, actor: clAdminActor(tenantId) });
    expect(result.entryType).toBe('TENANT_DEBIT');
  });

  it('still returns the payout to AM by id', async () => {
    const result = await getUseCase.execute({ entryId: payoutEntryId, actor: amActor() });
    expect(result.entryType).toBe('INSPECTOR_PAYOUT');
  });

  it('scopes every summary aggregate for CL_ADMIN, not only totalPayouts', async () => {
    const summary = await summaryUseCase.execute({ actor: clAdminActor(tenantId) });

    expect(summary.totalDebits).toBe(100);
    expect(summary.totalRefunds).toBe(20);
    // 10 only — the inspector-scoped 15 must not be summed in.
    expect(summary.totalAdjustments).toBe(10);
    expect(summary.totalPayouts).toBe(0);
    // The pending INSPECTOR_PAYOUT must not be counted for an agency.
    expect(summary.pendingCount).toBe(0);
  });

  it('keeps the full summary for AM', async () => {
    const summary = await summaryUseCase.execute({ tenantId, actor: amActor() });

    expect(summary.totalPayouts).toBe(80);
    expect(summary.totalAdjustments).toBe(25); // 10 + 15
    expect(summary.pendingCount).toBe(1);
  });
});
