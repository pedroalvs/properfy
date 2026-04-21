/**
 * T109 / T110 — Data-subject erasure end-to-end integration (real DB).
 *
 * T109: Full erasure flow — seed audit entries containing PII, run
 * ExecuteDataSubjectErasureUseCase, verify PII is [REDACTED] in the database
 * and a meta-audit entry was created.
 *
 * T110: Irreversibility — after a completed erasure, re-querying the same
 * audit rows via the repository still returns [REDACTED] values with no
 * recovery path.
 *
 * Uses the Testcontainers DB harness from `./harness.ts`. Migrations run via
 * `prisma migrate deploy`, which seeds the `pii_field_mappings` table with the
 * registry from migration 20260413000000_audit_retention_pii_redaction.
 *
 * The action pattern `user.` / field `email` (direct, requires_manual_review=false)
 * is the target PII surface for these tests — it is guaranteed to be present
 * after migrations run.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupDbHarness, teardownDbHarness, resetAuditTestTables, type DbHarness } from './harness';
import { ExecuteDataSubjectErasureUseCase } from '../../../src/modules/audit/application/use-cases/execute-data-subject-erasure.use-case';
import { PrismaAuditLogRepository } from '../../../src/modules/audit/infrastructure/prisma-audit-log.repository';
import { PrismaDataSubjectErasureRequestRepository } from '../../../src/modules/audit/infrastructure/prisma-data-subject-erasure-request.repository';
import { PrismaPiiFieldMappingRepository } from '../../../src/modules/audit/infrastructure/prisma-pii-field-mapping.repository';
import { PrismaErasurePiiResolver } from '../../../src/modules/audit/infrastructure/prisma-erasure-pii-resolver';
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

function buildUseCase(prisma: DbHarness['prisma']) {
  const logger = silentLogger();
  const auditLogRepo = new PrismaAuditLogRepository(prisma);
  const erasureRequestRepo = new PrismaDataSubjectErasureRequestRepository(prisma);
  const piiFieldMappingRepo = new PrismaPiiFieldMappingRepository(prisma);
  const erasurePiiResolver = new PrismaErasurePiiResolver(prisma);
  const auditService = new PersistentAuditService(auditLogRepo, logger as any);

  return new ExecuteDataSubjectErasureUseCase(
    erasureRequestRepo,
    auditLogRepo,
    piiFieldMappingRepo,
    erasurePiiResolver,
    auditService,
    prisma,
    logger as any,
  );
}

const AM_ACTOR = {
  userId: 'am-erasure-test',
  tenantId: null,
  role: 'AM' as const,
  branchId: null,
  inspectorId: null,
};

describe('T109 / T110: data-subject erasure (real DB)', () => {
  let harness: DbHarness | undefined;

  beforeAll(async () => {
    harness = await setupDbHarness();
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  beforeEach(async () => {
    if (harness) await resetAuditTestTables(harness.prisma);
  });

  it('T109 — erases PII from matched audit entries and sets request to COMPLETED', async () => {
    if (!harness) throw new Error('harness not initialized');
    const { prisma } = harness;

    const victimEmail = `victim-${randomUUID().slice(0, 8)}@erasure-test.local`;
    const victimName = 'Erasure Victim';

    // ── Seed 3 audit logs containing the victim's email in different snapshots
    const entryIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = randomUUID();
      entryIds.push(id);
      await prisma.auditLog.create({
        data: {
          id,
          tenant_id: null,
          actor_type: 'USER',
          actor_id: 'am-erasure-test',
          entity_type: 'User',
          entity_id: `user-subject-${i}`,
          action: 'user.updated',
          before_json: { email: victimEmail, name: victimName, phone: null },
          after_json: { email: 'new@email.com', name: victimName, phone: null },
          metadata_json: null,
          retention_category: 'OPERATIONAL_GENERAL',
          redaction_status: 'NONE',
          cold_storage: false,
        },
      });
    }

    // ── Create the erasure request in PREVIEW state with resolved PII values
    const requestId = randomUUID();
    await prisma.dataSubjectErasureRequest.create({
      data: {
        id: requestId,
        subject_identifier_type: 'email',
        subject_identifier_value: victimEmail,
        resolved_pii_values_json: [victimEmail, victimName],
        status: 'PREVIEW',
        initiated_by_user_id: 'am-erasure-test',
      },
    });

    // ── Run the use case
    const useCase = buildUseCase(prisma);
    const result = await useCase.execute({ requestId, actor: AM_ACTOR });
    // Allow the fire-and-forget meta-audit write to settle
    await new Promise((r) => setTimeout(r, 150));

    // ── Assert request completed
    expect(result.status).toBe('COMPLETED');
    expect(result.entriesFound).toBeGreaterThanOrEqual(3);
    expect(result.entriesRedacted).toBeGreaterThanOrEqual(3);

    // ── Assert PII is redacted in the database
    for (const id of entryIds) {
      const row = await prisma.auditLog.findUnique({ where: { id } });
      expect(row).not.toBeNull();
      const before = row!.before_json as Record<string, unknown>;
      expect(before['email']).toBe('[REDACTED]');
      // Non-PII field should be untouched
      expect(before['phone']).toBeNull();
    }

    // ── Assert meta-audit entry was created (no PII in it)
    const metaAudit = await prisma.auditLog.findFirst({
      where: { action: 'audit.data_subject_erasure_executed', entity_id: requestId },
    });
    expect(metaAudit).not.toBeNull();
    const meta = metaAudit!.metadata_json as Record<string, unknown>;
    expect(meta['requestId']).toBe(requestId);
    expect(meta).not.toHaveProperty('email');
    expect(meta).not.toHaveProperty('subjectEmail');
  });

  it('T110 — irreversibility: redacted values cannot be recovered via subsequent queries', async () => {
    if (!harness) throw new Error('harness not initialized');
    const { prisma } = harness;

    const victimEmail = `irreversible-${randomUUID().slice(0, 8)}@erasure-test.local`;

    const entryId = randomUUID();
    await prisma.auditLog.create({
      data: {
        id: entryId,
        tenant_id: null,
        actor_type: 'USER',
        actor_id: 'am-erasure-test',
        entity_type: 'User',
        entity_id: 'user-irreversible-test',
        action: 'user.updated',
        before_json: { email: victimEmail, name: 'Irreversible Subject' },
        after_json: { email: 'new@email.com', name: 'Updated Name' },
        metadata_json: null,
        retention_category: 'OPERATIONAL_GENERAL',
        redaction_status: 'NONE',
        cold_storage: false,
      },
    });

    const requestId = randomUUID();
    await prisma.dataSubjectErasureRequest.create({
      data: {
        id: requestId,
        subject_identifier_type: 'email',
        subject_identifier_value: victimEmail,
        resolved_pii_values_json: [victimEmail],
        status: 'PREVIEW',
        initiated_by_user_id: 'am-erasure-test',
      },
    });

    const useCase = buildUseCase(prisma);
    await useCase.execute({ requestId, actor: AM_ACTOR });

    // First verify erasure happened
    const row1 = await prisma.auditLog.findUnique({ where: { id: entryId } });
    const before1 = row1!.before_json as Record<string, unknown>;
    expect(before1['email']).toBe('[REDACTED]');

    // Re-query (simulates a second read or a different request path)
    const row2 = await prisma.auditLog.findUnique({ where: { id: entryId } });
    const before2 = row2!.before_json as Record<string, unknown>;
    expect(before2['email']).toBe('[REDACTED]');
    expect(JSON.stringify(before2)).not.toContain(victimEmail);

    // Re-running erasure on same entry is idempotent (skipped, not an error)
    const requestId2 = randomUUID();
    await prisma.dataSubjectErasureRequest.create({
      data: {
        id: requestId2,
        subject_identifier_type: 'email',
        subject_identifier_value: victimEmail,
        resolved_pii_values_json: [victimEmail],
        status: 'PREVIEW',
        initiated_by_user_id: 'am-erasure-test',
      },
    });
    const result2 = await useCase.execute({ requestId: requestId2, actor: AM_ACTOR });
    // After redaction the ILIKE search won't find '[REDACTED]' for the original
    // victim email, so entriesFound may be 0 or entriesRedacted 0 — both are
    // acceptable proof that the original PII is gone.
    expect(result2.status).toBe('COMPLETED');
  });
});
