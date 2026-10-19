/**
 * In-place edit of a PENDING manual adjustment (WEB-FIN-TYPING / PR-N) — real DB.
 *
 * A mocked repository would return its stub regardless of the WHERE clause and
 * hide exactly the guards this feature depends on, so these run against Postgres:
 *   1. Happy path — the editable columns are actually persisted.
 *   2. Type guard — a system-minted TENANT_DEBIT is refused and left untouched.
 *   3. Status guard — an APPROVED manual adjustment is refused and left untouched.
 *   4. Concurrency (idempotency, mirrors HOL-3b) — two concurrent calls that reuse
 *      the same Idempotency-Key with DIFFERENT payloads: exactly one wins, the
 *      other gets IDEMPOTENCY_PAYLOAD_MISMATCH, and the row reflects only the
 *      winner. REMOVING the idempotency guard makes BOTH mutate (0 rejected) — so
 *      this test fails without the guard (red proof).
 *   5. Replay — same key + same payload returns the cached result, edits once.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaFinancialEntryRepository } from '../../../src/modules/billing/infrastructure/prisma-financial-entry.repository';
import { UpdateFinancialEntryUseCase } from '../../../src/modules/billing/application/use-cases/update-financial-entry.use-case';
import { PrismaIdempotencyService } from '../../../src/modules/inspector-execution/infrastructure/prisma-idempotency.service';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import {
  EntryNotEditableError,
  BillingIdempotencyPayloadMismatchError,
} from '../../../src/modules/billing/domain/billing.errors';
import type { FinancialEntryStatus, FinancialEntryType } from '@properfy/shared';

let harness: DbHarness;
let tenantId: string;
let userId: string;
const auditStub = { log: () => {} } as any;

function amActor(): AuthContext {
  return { userId, tenantId: null, role: 'AM', branchId: null, inspectorId: null };
}

function makeUseCase(): UpdateFinancialEntryUseCase {
  const repo = new PrismaFinancialEntryRepository(harness.prisma);
  return new UpdateFinancialEntryUseCase(
    repo,
    auditStub,
    new AuthorizationService(auditStub),
    new PrismaIdempotencyService(harness.prisma),
  );
}

async function seedEntry(
  entryType: FinancialEntryType,
  status: FinancialEntryStatus,
  overrides: { amount?: string; description?: string } = {},
): Promise<string> {
  const row = await harness.prisma.financialEntry.create({
    data: {
      tenant_id: tenantId,
      entry_type: entryType,
      amount: overrides.amount ?? '100.00',
      currency: 'AUD',
      status,
      description: overrides.description ?? 'Original description',
      effective_at: new Date('2026-03-15T00:00:00.000Z'),
      initiated_by_user_id: userId,
      reason: 'Original reason',
    },
  });
  return row.id;
}

describe('Update financial entry — in-place edit (real DB)', () => {
  beforeAll(async () => {
    harness = await setupDbHarness();
    const tenant = await harness.prisma.tenant.create({
      data: {
        name: 'Edit Entry Tenant',
        legal_name: `Edit Entry LLC ${Math.random().toString(36).slice(2, 10)}`,
        status: 'ACTIVE',
      },
    });
    tenantId = tenant.id;
    const branch = await harness.prisma.branch.create({
      data: { tenant_id: tenant.id, name: 'Main Branch', status: 'ACTIVE' },
    });
    const user = await harness.prisma.user.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branch.id,
        role: 'OP',
        name: 'Editor',
        email: `editor-${Math.random().toString(36).slice(2, 10)}@test.local`,
        password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
        status: 'ACTIVE',
      },
    });
    userId = user.id;
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('persists the edited columns of a PENDING manual adjustment', async () => {
    const entryId = await seedEntry('MANUAL_ADJUSTMENT', 'PENDING');
    const result = await makeUseCase().execute({
      entryId,
      amount: 275.5,
      description: 'Corrected amount',
      effectiveAt: new Date('2026-04-01T00:00:00.000Z'),
      reason: 'Operator correction',
      idempotencyKey: 'edit-happy',
      actor: amActor(),
    });

    expect(result.amount).toBe(275.5);
    expect(result.description).toBe('Corrected amount');
    expect(result.reason).toBe('Operator correction');
    expect(result.status).toBe('PENDING');

    const row = await harness.prisma.financialEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(Number(row.amount)).toBe(275.5);
    expect(row.description).toBe('Corrected amount');
    expect(row.reason).toBe('Operator correction');
    expect(row.effective_at.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(row.status).toBe('PENDING');
  });

  it('refuses to edit a system-minted TENANT_DEBIT and leaves the row untouched', async () => {
    const entryId = await seedEntry('TENANT_DEBIT', 'PENDING');
    await expect(
      makeUseCase().execute({ entryId, amount: 999, idempotencyKey: 'edit-debit', actor: amActor() }),
    ).rejects.toThrow(EntryNotEditableError);

    const row = await harness.prisma.financialEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(Number(row.amount)).toBe(100);
    expect(row.description).toBe('Original description');
  });

  it('refuses to edit an APPROVED manual adjustment and leaves the row untouched', async () => {
    const entryId = await seedEntry('MANUAL_ADJUSTMENT', 'APPROVED');
    await expect(
      makeUseCase().execute({ entryId, amount: 999, idempotencyKey: 'edit-approved', actor: amActor() }),
    ).rejects.toThrow(EntryNotEditableError);

    const row = await harness.prisma.financialEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(Number(row.amount)).toBe(100);
    expect(row.status).toBe('APPROVED');
  });

  it('two concurrent edits reusing one key with different payloads: exactly one wins (idempotency guard)', async () => {
    const entryId = await seedEntry('MANUAL_ADJUSTMENT', 'PENDING');
    const key = 'edit-concurrent';

    // Same Idempotency-Key, different payloads. The guard claims the key for the
    // first payload; the other request sees a claim whose payloadHash differs and
    // is rejected with IDEMPOTENCY_PAYLOAD_MISMATCH — deterministic regardless of
    // which call wins the DB race. Without the guard, BOTH would mutate (0 rejected).
    const results = await Promise.allSettled([
      makeUseCase().execute({ entryId, amount: 111, idempotencyKey: key, actor: amActor() }),
      makeUseCase().execute({ entryId, amount: 222, idempotencyKey: key, actor: amActor() }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BillingIdempotencyPayloadMismatchError);

    const winnerAmount = (fulfilled[0] as PromiseFulfilledResult<{ amount: number }>).value.amount;
    expect([111, 222]).toContain(winnerAmount);

    const row = await harness.prisma.financialEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(Number(row.amount)).toBe(winnerAmount);
  });

  it('replays the cached result on same key + same payload (edits once)', async () => {
    const entryId = await seedEntry('MANUAL_ADJUSTMENT', 'PENDING');
    const useCase = makeUseCase();
    const input = { entryId, amount: 333, description: 'Replay edit', idempotencyKey: 'edit-replay', actor: amActor() };

    const first = await useCase.execute(input);
    const second = await useCase.execute(input);

    expect(Number(second.amount)).toBe(333);
    expect(second.id).toBe(first.id);

    const row = await harness.prisma.financialEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(Number(row.amount)).toBe(333);
    expect(row.description).toBe('Replay edit');
  });
});
