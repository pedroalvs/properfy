/**
 * B2 #132 — Prisma JSON null sentinels for the erasure request repository.
 *
 * Regression guard: `save()` / `update()` used to coalesce a null
 * `resolvedPiiValuesJson` / `completionReportJson` to a plain `null` cast
 * through `Prisma.InputJsonValue`. At runtime Prisma rejects that with
 * "Argument ... must not be null / null is not a valid InputJsonValue",
 * so persisting a freshly-created (PENDING) erasure request threw.
 *
 * With the `Prisma.DbNull` sentinel the null JSON columns round-trip as SQL
 * NULL. This test fails on the pre-fix code with a Prisma runtime error.
 *
 * Uses the Testcontainers DB harness from `./harness.ts`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupDbHarness, teardownDbHarness, resetAuditTestTables, type DbHarness } from './harness';
import { PrismaDataSubjectErasureRequestRepository } from '../../../src/modules/audit/infrastructure/prisma-data-subject-erasure-request.repository';
import { DataSubjectErasureRequestEntity } from '../../../src/modules/audit/domain/data-subject-erasure-request.entity';

describe('B2 #132: erasure request JSON null sentinels (real DB)', () => {
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

  it('save() persists an entity with both JSON fields null and reads them back as null', async () => {
    if (!harness) throw new Error('harness not initialized');
    const repo = new PrismaDataSubjectErasureRequestRepository(harness.prisma);

    const id = randomUUID();
    const entity = new DataSubjectErasureRequestEntity({
      id,
      subjectIdentifierType: 'email',
      subjectIdentifierValue: `null-json-${id.slice(0, 8)}@erasure-test.local`,
      resolvedPiiValuesJson: null,
      status: 'PENDING',
      entriesFoundCount: null,
      entriesRedactedCount: null,
      entriesFlaggedForReviewCount: null,
      completionReportJson: null,
      initiatedByUserId: 'am-b2-test',
      initiatedAt: new Date(),
      completedAt: null,
    });

    // Pre-fix this throws a Prisma "null is not a valid InputJsonValue" error.
    await expect(repo.save(entity)).resolves.toBeUndefined();

    const readBack = await repo.findById(id);
    expect(readBack).not.toBeNull();
    expect(readBack!.resolvedPiiValuesJson).toBeNull();
    expect(readBack!.completionReportJson).toBeNull();
  });

  it('update() also accepts null JSON fields without a Prisma runtime error', async () => {
    if (!harness) throw new Error('harness not initialized');
    const repo = new PrismaDataSubjectErasureRequestRepository(harness.prisma);

    const id = randomUUID();
    const entity = new DataSubjectErasureRequestEntity({
      id,
      subjectIdentifierType: 'email',
      subjectIdentifierValue: `null-update-${id.slice(0, 8)}@erasure-test.local`,
      resolvedPiiValuesJson: null,
      status: 'PENDING',
      entriesFoundCount: null,
      entriesRedactedCount: null,
      entriesFlaggedForReviewCount: null,
      completionReportJson: null,
      initiatedByUserId: 'am-b2-test',
      initiatedAt: new Date(),
      completedAt: null,
    });
    await repo.save(entity);

    // Move it forward but leave both JSON columns null.
    entity.markScanning();
    entity.entriesFoundCount = 0;

    await expect(repo.update(entity)).resolves.toBeUndefined();

    const readBack = await repo.findById(id);
    expect(readBack!.status).toBe('SCANNING');
    expect(readBack!.resolvedPiiValuesJson).toBeNull();
    expect(readBack!.completionReportJson).toBeNull();
  });
});
