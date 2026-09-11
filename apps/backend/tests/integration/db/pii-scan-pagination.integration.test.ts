/**
 * B4 #414 — the PII superset scan must return EVERY match, not a silently
 * truncated page. The old implementation capped both the hot and archive
 * queries at `LIMIT 5000` with no cursor, so an erasure could proceed on an
 * incomplete scan.
 *
 * These tests drive the keyset pagination with a tiny injected page size so a
 * handful of seeded rows spans several internal pages:
 *   1. all matches across the page boundary are returned (fails if pagination
 *      is removed / a single LIMIT returns a partial set);
 *   2. exceeding the injected hard ceiling throws instead of returning a
 *      silently-truncated set.
 *
 * Uses the Testcontainers DB harness from `./harness.ts`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupDbHarness, teardownDbHarness, resetAuditTestTables, type DbHarness } from './harness';
import { PrismaAuditLogRepository } from '../../../src/modules/audit/infrastructure/prisma-audit-log.repository';

async function seedMatchingEntries(
  prisma: DbHarness['prisma'],
  victimEmail: string,
  count: number,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        tenant_id: null,
        actor_type: 'USER',
        actor_id: 'am-b4-test',
        entity_type: 'User',
        entity_id: `user-${i}`,
        action: 'user.updated',
        before_json: { email: victimEmail, name: `Subject ${i}` },
        after_json: null,
        metadata_json: null,
        retention_category: 'OPERATIONAL_GENERAL',
        redaction_status: 'NONE',
        cold_storage: false,
      },
    });
  }
}

describe('B4 #414: PII scan keyset pagination (real DB)', () => {
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

  it('returns all matches spanning several internal pages', async () => {
    if (!harness) throw new Error('harness not initialized');
    const victimEmail = `pagination-${randomUUID().slice(0, 8)}@erasure-test.local`;
    // 5 matching rows with a page size of 2 → three internal pages (2 + 2 + 1).
    await seedMatchingEntries(harness.prisma, victimEmail, 5);
    // Plus a non-matching row that must not appear in the results.
    await seedMatchingEntries(harness.prisma, 'someone-else@example.com', 1);

    const repo = new PrismaAuditLogRepository(harness.prisma, 2);
    const matches = await repo.searchPiiByValues([victimEmail], ['email'], {
      includeArchived: false,
    });

    // A single-page LIMIT would return at most 2; the fix returns all 5.
    expect(matches).toHaveLength(5);
    expect(matches.every((m) => m.entityType === 'User')).toBe(true);
  });

  it('throws instead of silently truncating when the hard ceiling is exceeded', async () => {
    if (!harness) throw new Error('harness not initialized');
    const victimEmail = `ceiling-${randomUUID().slice(0, 8)}@erasure-test.local`;
    await seedMatchingEntries(harness.prisma, victimEmail, 6);

    // pageSize 2, ceiling 3 → after accumulating > 3 matches the scan must throw.
    const repo = new PrismaAuditLogRepository(harness.prisma, 2, 3);
    await expect(
      repo.searchPiiByValues([victimEmail], ['email'], { includeArchived: false }),
    ).rejects.toThrow(/safety ceiling/i);
  });
});
