/**
 * Sprint 1 W-3 — T111 retention vs erasure concurrency end-to-end.
 *
 * Proves the IN_PROGRESS coordination flag between the erasure workflow and
 * the retention worker holds against a real PostgreSQL database, not just
 * against unit-test mocks.
 *
 * What this test covers:
 *   1. Seed 10 audit entries in `OPERATIONAL_GENERAL` with `created_at` far
 *      in the past — all eligible for retention move.
 *   2. Simulate the erasure workflow's first step by flipping their
 *      `redaction_status` to `IN_PROGRESS` via the real Prisma repository
 *      method (`updateRedactionStatus`).
 *   3. Run the real `AuditRetentionWorker` against the real database.
 *   4. Assert none of the 10 rows moved to `audit_logs_archive`. This is
 *      the concurrency guarantee.
 *   5. Simulate erasure completion by flipping the same 10 rows to
 *      `redaction_status = 'FULL'`.
 *   6. Re-run the worker.
 *   7. Assert all 10 rows are now in `audit_logs_archive` (no longer
 *      blocked by the IN_PROGRESS flag).
 *
 * Implementation note discovered in Sprint 1 W-3:
 *   The coordination guard is actually at the **SQL layer**, not the
 *   application layer. `PrismaAuditLogRepository.findEligibleForRetention`
 *   includes `redaction_status: { not: 'IN_PROGRESS' }` in its WHERE clause,
 *   so IN_PROGRESS rows are filtered out before they ever reach the
 *   worker's per-row evaluation. The in-memory `skippedInProgressCount`
 *   counter in `AuditRetentionWorker.processCategoryMove` is defensive
 *   dead code: it only fires if the repo query ever returns an IN_PROGRESS
 *   row, which it cannot. This is a desirable design — the filter is more
 *   robust at the DB layer than in application code.
 *
 *   This test asserts the **observable effect** (no move to archive), not
 *   the in-memory counter. If the filter is ever removed from the repo
 *   query, this test will fail at step 4 and catch the regression.
 *
 * If this test fails at step 4, the concurrency guard is broken and the
 * erasure workflow races with retention → data corruption risk. If it
 * fails at step 7, the IN_PROGRESS state is permanently sticky → audit
 * retention is broken after any erasure.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  setupDbHarness,
  teardownDbHarness,
  type DbHarness,
} from './harness';
import { AuditRetentionWorker } from '../../../src/modules/audit/infrastructure/workers/audit-retention.worker';
import { PrismaAuditLogRepository } from '../../../src/modules/audit/infrastructure/prisma-audit-log.repository';
import { PrismaAuditRetentionCategoryRepository } from '../../../src/modules/audit/infrastructure/prisma-audit-retention-category.repository';
import { PrismaAuditLegalHoldRepository } from '../../../src/modules/audit/infrastructure/prisma-audit-legal-hold.repository';
import { PrismaAuditPreservationRuleRepository } from '../../../src/modules/audit/infrastructure/prisma-audit-preservation-rule.repository';
import { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';

function silentLogger() {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    fatal: () => {},
    trace: () => {},
    child: () => silentLogger(),
    silent: () => {},
    level: 'silent',
  };
}

function buildWorker(prisma: DbHarness['prisma']) {
  const logger = silentLogger();
  const auditLogRepo = new PrismaAuditLogRepository(prisma);
  const categoryRepo = new PrismaAuditRetentionCategoryRepository(prisma);
  const legalHoldRepo = new PrismaAuditLegalHoldRepository(prisma);
  const preservationRuleRepo = new PrismaAuditPreservationRuleRepository(prisma);
  const auditService = new PersistentAuditService(auditLogRepo, logger as any);

  return new AuditRetentionWorker(
    prisma,
    auditLogRepo,
    categoryRepo,
    legalHoldRepo,
    preservationRuleRepo,
    auditService,
    logger as any,
    100,
  );
}

describe('W-3 / T111: retention vs erasure concurrency (real DB)', () => {
  let harness: DbHarness | undefined;

  beforeAll(async () => {
    harness = await setupDbHarness();
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('skips IN_PROGRESS rows and moves them once marked FULL', async () => {
    if (!harness) throw new Error('harness not initialized');
    const { prisma } = harness;

    // Override OPERATIONAL_GENERAL retention so every seeded entry is eligible
    await prisma.auditRetentionCategoryConfig.update({
      where: { name: 'OPERATIONAL_GENERAL' },
      data: { retention_years: 0.000000001 },
    });

    // ─── Step 1: seed 10 audit entries eligible for retention move ───
    const entryIds: string[] = [];
    const longAgo = new Date('2010-01-01T00:00:00Z');
    for (let i = 0; i < 10; i++) {
      const id = randomUUID();
      entryIds.push(id);
      await prisma.auditLog.create({
        data: {
          id,
          tenant_id: null,
          actor_type: 'SYSTEM',
          actor_id: null,
          entity_type: 'ConcurrencyTest',
          entity_id: `concurrency-${i}`,
          action: 'user.updated', // operational action (OPERATIONAL_GENERAL)
          before_json: { email: 'pre@example.com' },
          after_json: { email: `post-${i}@example.com` },
          metadata_json: { source: 'T111 concurrency seed', index: i },
          created_at: longAgo,
          retention_category: 'OPERATIONAL_GENERAL',
          redaction_status: 'NONE',
          cold_storage: false,
        },
      });
    }
    expect(await prisma.auditLog.count({ where: { id: { in: entryIds } } })).toBe(10);
    expect(await prisma.auditLogArchive.count({ where: { id: { in: entryIds } } })).toBe(0);

    // ─── Step 2: simulate the erasure workflow flipping them to IN_PROGRESS ───
    // Use the real repository method, not direct SQL — this exercises the
    // exact code path the ExecuteDataSubjectErasureUseCase calls.
    const auditLogRepo = new PrismaAuditLogRepository(prisma);
    await auditLogRepo.updateRedactionStatus(entryIds, 'IN_PROGRESS');

    // Verify the flag landed on all 10 rows
    const inProgressCount = await prisma.auditLog.count({
      where: { id: { in: entryIds }, redaction_status: 'IN_PROGRESS' },
    });
    expect(inProgressCount).toBe(10);

    // ─── Step 3: run the retention worker concurrently ───
    const worker = buildWorker(prisma);
    await worker.execute();

    // ─── Step 4: assert no entries moved to archive ───
    // The guard is at the SQL layer (`findEligibleForRetention` filters out
    // IN_PROGRESS rows in its WHERE clause) — the observable effect is that
    // none of the 10 rows landed in `audit_logs_archive`. The in-memory
    // `skippedInProgressCount` counter is defensive dead code (see the file
    // header for the rationale). We assert the effect, not the counter.
    expect(await prisma.auditLogArchive.count({ where: { id: { in: entryIds } } })).toBe(0);
    // All 10 still in the hot table, still IN_PROGRESS
    expect(
      await prisma.auditLog.count({
        where: { id: { in: entryIds }, redaction_status: 'IN_PROGRESS' },
      }),
    ).toBe(10);

    // ─── Step 5: simulate erasure completion → FULL ───
    await auditLogRepo.updateRedactionStatus(entryIds, 'FULL');

    // ─── Step 6: re-run the worker ───
    const result2 = await worker.execute();

    // ─── Step 7: assert all 10 are now in archive ───
    expect(result2.movedCount).toBeGreaterThanOrEqual(10);
    expect(await prisma.auditLog.count({ where: { id: { in: entryIds } } })).toBe(0);
    expect(await prisma.auditLogArchive.count({ where: { id: { in: entryIds } } })).toBe(10);
  });
});
