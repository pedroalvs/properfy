/**
 * Sprint 1 W-2 — T061 cross-check invariance end-to-end.
 *
 * The single most important test in 020: proves the 006 cross-check
 * origin-lookup invariant holds under retention pressure, against a real
 * PostgreSQL database and the real `AuditRetentionWorker`.
 *
 * What this test covers:
 *   1. Seed a legacy `DONE` appointment (`done_marked_by_user_id = NULL`,
 *      `done_checked_at = NULL`) — the exact state the 006 fallback audit
 *      scan was designed to handle.
 *   2. Seed a real `appointment.status_transition` audit entry with
 *      `after_json.status = 'DONE'`, `entity_type = 'Appointment'`,
 *      `entity_id = <appointment.id>`, `retention_category = 'OPERATIONAL_CRITICAL'`,
 *      and `created_at = now() - 10 years` (well past any retention cutoff).
 *   3. Override the `OPERATIONAL_CRITICAL` retention to 1ms so the entry
 *      is eligible for retention processing.
 *   4. Run the real `AuditRetentionWorker` against the real database.
 *   5. Assert the audit entry is STILL in `audit_logs` (not moved to
 *      `audit_logs_archive`) — this is the FR-008 cross-check preservation.
 *   6. Simulate the 006 fallback audit scan (the same query
 *      `PerformCrossCheckUseCase` runs when `done_marked_by_user_id = NULL`)
 *      and assert it finds the preserved entry.
 *   7. Flip `appointments.done_checked_at` to a real date (simulating the
 *      cross-check having been performed), re-run the worker, and assert
 *      the entry NOW moves to `audit_logs_archive` (preservation no longer
 *      applies).
 *
 * If this test fails at step 5 or 6, the 006 invariant is broken under
 * retention and the 020 compliance story collapses. If it fails at step 7,
 * the preservation rule is stuck-on and retention never runs — also broken.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupDbHarness,
  teardownDbHarness,
  seedLegacyDoneAppointment,
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
  } as unknown as Parameters<typeof AuditRetentionWorker.prototype.constructor>[6];
}

describe('W-2 / T061: 006 cross-check invariance under retention (real DB)', () => {
  let harness: DbHarness | undefined;

  beforeAll(async () => {
    harness = await setupDbHarness();
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('preserves the audit entry for a legacy DONE appointment and allows the fallback scan to find it', async () => {
    if (!harness) throw new Error('harness not initialized');
    const { prisma } = harness;

    // ─── Step 1: seed legacy DONE appointment (done_checked_at = NULL) ───
    const fixture = await seedLegacyDoneAppointment(prisma);

    // ─── Step 2: seed the appointment.status_transition audit entry ───
    const auditEntryId = '00000000-0000-0000-0000-00000000t061';
    const longAgo = new Date('2015-01-01T00:00:00Z'); // 10+ years in the past

    await prisma.auditLog.create({
      data: {
        id: auditEntryId,
        tenant_id: fixture.tenantId,
        actor_type: 'USER',
        actor_id: fixture.userId, // note: not NULL — we have a real actor
        entity_type: 'Appointment',
        entity_id: fixture.appointmentId,
        action: 'appointment.status_transition',
        reason: null,
        before_json: { status: 'SCHEDULED' },
        after_json: { status: 'DONE' },
        request_id: null,
        ip_address: null,
        metadata_json: { source: 'T061 test seed' },
        created_at: longAgo,
        retention_category: 'OPERATIONAL_CRITICAL',
        redaction_status: 'NONE',
        cold_storage: false,
        preservation_rule_id: null,
      },
    });

    // Sanity check: the entry exists in the hot table and not in the archive
    expect(await prisma.auditLog.count({ where: { id: auditEntryId } })).toBe(1);
    expect(await prisma.auditLogArchive.count({ where: { id: auditEntryId } })).toBe(0);

    // ─── Step 3: override OPERATIONAL_CRITICAL retention to 1ms ───
    await prisma.auditRetentionCategoryConfig.update({
      where: { name: 'OPERATIONAL_CRITICAL' },
      data: { retention_years: 0.000000001 }, // effectively 0 → eligible
    });

    // ─── Step 4: run the real AuditRetentionWorker ───
    const logger = silentLogger();
    const auditLogRepo = new PrismaAuditLogRepository(prisma);
    const categoryRepo = new PrismaAuditRetentionCategoryRepository(prisma);
    const legalHoldRepo = new PrismaAuditLegalHoldRepository(prisma);
    const preservationRuleRepo = new PrismaAuditPreservationRuleRepository(prisma);
    const auditService = new PersistentAuditService(auditLogRepo, logger as any);

    const worker = new AuditRetentionWorker(
      prisma,
      auditLogRepo,
      categoryRepo,
      legalHoldRepo,
      preservationRuleRepo,
      auditService,
      logger as any,
      100, // small batch size
    );

    const result = await worker.execute();

    // ─── Step 5: assert the entry is STILL in audit_logs (preserved) ───
    expect(await prisma.auditLog.count({ where: { id: auditEntryId } })).toBe(1);
    expect(await prisma.auditLogArchive.count({ where: { id: auditEntryId } })).toBe(0);
    expect(result.preservedByRule.crossCheck).toBeGreaterThanOrEqual(1);

    // ─── Step 6: simulate the 006 fallback audit scan (same query PerformCrossCheckUseCase uses) ───
    const latestTransitions = await auditLogRepo.findAll(
      {
        tenantId: fixture.tenantId,
        entityType: 'Appointment',
        entityId: fixture.appointmentId,
        action: 'appointment.status_transition',
      },
      { page: 1, pageSize: 20, sortOrder: 'desc' },
    );
    const doneTransition = latestTransitions.find((entry) => {
      const after = entry.afterJson as { status?: string } | null;
      return after?.status === 'DONE';
    });
    expect(doneTransition).toBeDefined();
    expect(doneTransition!.actorId).toBe(fixture.userId);
    expect(doneTransition!.id).toBe(auditEntryId);
  });

  it('moves the entry to audit_logs_archive once the appointment has been cross-checked', async () => {
    if (!harness) throw new Error('harness not initialized');
    const { prisma } = harness;

    // Seed a fresh appointment + audit entry (independent of the first test)
    const fixture = await seedLegacyDoneAppointment(prisma, {
      tenantName: 'T061 Phase 2 Tenant',
    });
    const auditEntryId = '00000000-0000-0000-0000-00000000t062';
    const longAgo = new Date('2015-01-01T00:00:00Z');

    await prisma.auditLog.create({
      data: {
        id: auditEntryId,
        tenant_id: fixture.tenantId,
        actor_type: 'USER',
        actor_id: fixture.userId,
        entity_type: 'Appointment',
        entity_id: fixture.appointmentId,
        action: 'appointment.status_transition',
        before_json: { status: 'SCHEDULED' },
        after_json: { status: 'DONE' },
        metadata_json: { source: 'T061 phase 2 seed' },
        created_at: longAgo,
        retention_category: 'OPERATIONAL_CRITICAL',
        redaction_status: 'NONE',
        cold_storage: false,
      },
    });

    // Ensure the retention category is still effectively-zero
    await prisma.auditRetentionCategoryConfig.update({
      where: { name: 'OPERATIONAL_CRITICAL' },
      data: { retention_years: 0.000000001 },
    });

    // ─── Mark the appointment as cross-checked ───
    await prisma.appointment.update({
      where: { id: fixture.appointmentId },
      data: {
        done_checked_by_user_id: fixture.userId,
        done_checked_at: new Date(),
      },
    });

    // ─── Re-run the worker ───
    const logger = silentLogger();
    const auditLogRepo = new PrismaAuditLogRepository(prisma);
    const categoryRepo = new PrismaAuditRetentionCategoryRepository(prisma);
    const legalHoldRepo = new PrismaAuditLegalHoldRepository(prisma);
    const preservationRuleRepo = new PrismaAuditPreservationRuleRepository(prisma);
    const auditService = new PersistentAuditService(auditLogRepo, logger as any);

    const worker = new AuditRetentionWorker(
      prisma,
      auditLogRepo,
      categoryRepo,
      legalHoldRepo,
      preservationRuleRepo,
      auditService,
      logger as any,
      100,
    );
    await worker.execute();

    // ─── Assert the entry moved to archive ───
    expect(await prisma.auditLog.count({ where: { id: auditEntryId } })).toBe(0);
    expect(await prisma.auditLogArchive.count({ where: { id: auditEntryId } })).toBe(1);
  });
});
