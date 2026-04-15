/**
 * Sprint 1 W-1 — Testcontainers harness validation test.
 *
 * Minimum proof that the real-database integration harness works end-to-end:
 *   1. Spins up a PostgreSQL 16 container
 *   2. Applies every Prisma migration via `prisma migrate deploy`
 *   3. Writes a single audit log row via the real Prisma client
 *   4. Reads the row back and verifies its persisted shape
 *   5. Tears down the container
 *
 * If this test passes, the harness is usable by W-2 (T061 cross-check
 * invariance) and W-3 (T111 retention/erasure concurrency) and any future
 * real-DB test.
 *
 * If this test fails, the harness is broken and W-2 / W-3 cannot proceed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';

describe('W-1: testcontainers harness validation', () => {
  let harness: DbHarness | undefined;

  beforeAll(async () => {
    harness = await setupDbHarness();
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('spins up Postgres, applies migrations, and round-trips a real audit log row', async () => {
    if (!harness) throw new Error('harness not initialized');

    // Write a single audit log row via the real Prisma client.
    const entryId = '00000000-0000-0000-0000-000000000001';
    await harness.prisma.auditLog.create({
      data: {
        id: entryId,
        tenant_id: null,
        actor_type: 'SYSTEM',
        actor_id: null,
        entity_type: 'HarnessTest',
        entity_id: null,
        action: 'harness.smoke',
        reason: null,
        before_json: null,
        after_json: { harness: 'validation' },
        request_id: null,
        ip_address: null,
        metadata_json: { note: 'W-1 acceptance evidence' },
        retention_category: 'OPERATIONAL_GENERAL',
        redaction_status: 'NONE',
      },
    });

    // Read it back and verify.
    const fetched = await harness.prisma.auditLog.findUnique({
      where: { id: entryId },
    });

    expect(fetched).not.toBeNull();
    expect(fetched!.action).toBe('harness.smoke');
    expect(fetched!.entity_type).toBe('HarnessTest');
    expect(fetched!.retention_category).toBe('OPERATIONAL_GENERAL');
    expect(fetched!.redaction_status).toBe('NONE');
    expect(fetched!.cold_storage).toBe(false); // default column present
    expect(fetched!.preservation_rule_id).toBeNull();
    expect((fetched!.after_json as Record<string, unknown>).harness).toBe('validation');
  });

  it('verifies the 020 schema created the audit_logs_archive table', async () => {
    if (!harness) throw new Error('harness not initialized');

    const rows: Array<{ table_name: string }> = await harness.prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'audit_logs_archive'
    `);
    expect(rows.length).toBe(1);
  });

  it('verifies the harness seeded the three retention categories', async () => {
    if (!harness) throw new Error('harness not initialized');

    const categories = await harness.prisma.auditRetentionCategoryConfig.findMany({
      orderBy: { name: 'asc' },
    });
    // FR-001 / FR-002: three categories are seeded by `setupDbHarness`
    expect(categories.length).toBe(3);
    const names = categories.map((c) => c.name).sort();
    expect(names).toEqual(['FINANCIAL', 'OPERATIONAL_CRITICAL', 'OPERATIONAL_GENERAL']);
    // FR-033: FINANCIAL retention floor is 7 years
    const financial = categories.find((c) => c.name === 'FINANCIAL')!;
    expect(financial.retention_years).toBeGreaterThanOrEqual(7);
  });
});
