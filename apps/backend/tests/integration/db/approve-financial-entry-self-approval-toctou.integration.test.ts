/**
 * Maker-checker TOCTOU on approve (SoD follow-up to PR-N) — real DB.
 *
 * The self-approval invariant must survive a race: an AM/OP cannot approve
 * economic content they authored, EVEN IF they re-bind themselves as the maker
 * (via the in-place edit, which keeps status=PENDING) in the window between the
 * approve use-case's pre-check read and its commit.
 *
 * The approve use-case keeps a fast read-then-check (`assertNotSelfApproval` on
 * the loaded entry) for the precise, audited error in the common/sequential
 * case. The real guard, though, lives in the commit itself: a compare-and-swap
 * (`approvePendingEntry`) whose WHERE folds in `initiated_by_user_id IS NULL OR
 * <> approver`. A status-only CAS (the pre-fix behaviour) does NOT catch the
 * re-bind, because the edit leaves status=PENDING — so the interleaving test
 * below FAILS without the guard (red proof).
 *
 * A mocked repo would return its stub regardless of the WHERE clause and hide
 * exactly this guard, so these run against Postgres.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaFinancialEntryRepository } from '../../../src/modules/billing/infrastructure/prisma-financial-entry.repository';
import { ApproveFinancialEntryUseCase } from '../../../src/modules/billing/application/use-cases/approve-financial-entry.use-case';
import { PrismaIdempotencyService } from '../../../src/modules/inspector-execution/infrastructure/prisma-idempotency.service';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { FinancialEntryEntity } from '../../../src/modules/billing/domain/financial-entry.entity';

let harness: DbHarness;
let tenantId: string;
let branchId: string;
const auditStub = { log: () => {} } as any;

function opActor(uid: string): AuthContext {
  return { userId: uid, tenantId: null, role: 'OP', branchId: null, inspectorId: null };
}

async function createUser(label: string): Promise<string> {
  const user = await harness.prisma.user.create({
    data: {
      tenant_id: tenantId,
      branch_id: branchId,
      role: 'OP',
      name: label,
      email: `${label}-${Math.random().toString(36).slice(2, 10)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  return user.id;
}

async function seedPendingManualAdjustment(initiatedByUserId: string | null): Promise<string> {
  const row = await harness.prisma.financialEntry.create({
    data: {
      tenant_id: tenantId,
      entry_type: 'MANUAL_ADJUSTMENT',
      amount: '100.00',
      currency: 'AUD',
      status: 'PENDING',
      description: 'Adjustment',
      effective_at: new Date('2026-03-15T00:00:00.000Z'),
      initiated_by_user_id: initiatedByUserId,
      reason: 'Original reason',
    },
  });
  return row.id;
}

function makeRepo() {
  return new PrismaFinancialEntryRepository(harness.prisma);
}

function makeApproveUseCase(repo = makeRepo()) {
  return new ApproveFinancialEntryUseCase(
    repo,
    auditStub,
    new AuthorizationService(auditStub),
    new PrismaIdempotencyService(harness.prisma),
  );
}

describe('Approve financial entry — maker-checker TOCTOU (real DB)', () => {
  beforeAll(async () => {
    harness = await setupDbHarness();
    const tenant = await harness.prisma.tenant.create({
      data: {
        name: 'SoD TOCTOU Tenant',
        legal_name: `SoD TOCTOU LLC ${Math.random().toString(36).slice(2, 10)}`,
        status: 'ACTIVE',
      },
    });
    tenantId = tenant.id;
    const branch = await harness.prisma.branch.create({
      data: { tenant_id: tenant.id, name: 'Main Branch', status: 'ACTIVE' },
    });
    branchId = branch.id;
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  describe('approvePendingEntry compare-and-swap guard', () => {
    it('rejects (0 rows) when the approver is the recorded maker, leaving the row PENDING', async () => {
      const maker = await createUser('maker');
      const entryId = await seedPendingManualAdjustment(maker);

      const affected = await makeRepo().approvePendingEntry(entryId, tenantId, maker, new Date());

      expect(affected).toBe(0);
      const row = await harness.prisma.financialEntry.findUniqueOrThrow({ where: { id: entryId } });
      expect(row.status).toBe('PENDING');
      expect(row.approved_by_user_id).toBeNull();
    });

    it('approves (1 row) when a different operator checks the maker', async () => {
      const maker = await createUser('maker-2');
      const checker = await createUser('checker-2');
      const entryId = await seedPendingManualAdjustment(maker);

      const affected = await makeRepo().approvePendingEntry(entryId, tenantId, checker, new Date());

      expect(affected).toBe(1);
      const row = await harness.prisma.financialEntry.findUniqueOrThrow({ where: { id: entryId } });
      expect(row.status).toBe('APPROVED');
      expect(row.approved_by_user_id).toBe(checker);
    });

    it('approves (1 row) a system-minted entry with a NULL maker — never a self-approval', async () => {
      // NULL <> approver is NULL (not TRUE) in SQL, so a naive `{ not: approver }`
      // predicate would wrongly exclude system entries. This asserts the OR(null)
      // branch keeps them approvable.
      const checker = await createUser('checker-3');
      const entryId = await seedPendingManualAdjustment(null);

      const affected = await makeRepo().approvePendingEntry(entryId, tenantId, checker, new Date());

      expect(affected).toBe(1);
      const row = await harness.prisma.financialEntry.findUniqueOrThrow({ where: { id: entryId } });
      expect(row.status).toBe('APPROVED');
      expect(row.approved_by_user_id).toBe(checker);
    });
  });

  it('blocks self-approval when the maker is re-bound to the approver AFTER the pre-check (TOCTOU)', async () => {
    // The attacker X is a valid AM/OP. The entry starts authored by someone else
    // (Z), so the approve pre-check (assertNotSelfApproval against the read value)
    // passes. In the window before the commit, X's own concurrent edit re-binds
    // initiated_by_user_id = X while keeping status=PENDING. A status-only CAS
    // would then approve X's own content; the maker-guarded CAS must reject it.
    const attacker = await createUser('attacker');
    const original = await createUser('original-author');
    const entryId = await seedPendingManualAdjustment(original);

    // A repo seam that fires the concurrent re-bind exactly once, right after the
    // approve use-case's pre-check read returns — simulating the interleaving
    // deterministically (no flaky Promise.race).
    const repo = makeRepo();
    let injected = false;
    const originalFindById = repo.findById.bind(repo);
    repo.findById = async (id: string): Promise<FinancialEntryEntity | null> => {
      const entry = await originalFindById(id);
      if (!injected) {
        injected = true;
        // The attacker edits the amount and becomes the recorded maker (the exact
        // effect of updateManualAdjustmentFields), still PENDING.
        await repo.updateManualAdjustmentFields(id, tenantId, attacker, { amount: 9999 });
      }
      return entry;
    };

    const approveUC = makeApproveUseCase(repo);

    await expect(
      approveUC.execute({ entryId, idempotencyKey: 'toctou-approve', actor: opActor(attacker) }),
    ).rejects.toThrow(ForbiddenError);

    // The entry must remain unapproved.
    const row = await harness.prisma.financialEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(row.status).toBe('PENDING');
    expect(row.approved_by_user_id).toBeNull();
  });
});
