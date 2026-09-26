/**
 * Real-database regression for WI-8 (#339, #343): tenant-eligibility filtering
 * on the inspector list must happen at the DB level, not as an in-memory
 * post-filter after `skip`/`take` have already been applied.
 *
 * The current `findAll`/`count` apply `LIMIT pageSize` in SQL and only then
 * drop tenant-blocked rows in JS — so a page can come back short (fewer than
 * `pageSize` rows) even when enough eligible inspectors exist, and `count()`
 * (which does its own full in-memory filter, duplicating the query) can drift
 * from what `findAll` actually returns. This must run against real Postgres:
 * a mock would happily return whatever rows are asked for regardless of the
 * WHERE clause, which is exactly the class of bug this guards.
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend exec vitest run --config vitest.integration-db.config.ts tests/integration/db/inspector-tenant-eligibility-pagination.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaInspectorRepository } from '../../../src/modules/inspector/infrastructure/prisma-inspector.repository';

let harness: DbHarness;
let repo: PrismaInspectorRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaInspectorRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(`TRUNCATE TABLE inspectors CASCADE`);
});

async function seedInspector(
  prisma: PrismaClient,
  n: number,
  blockedClients: unknown[] = [],
): Promise<void> {
  await prisma.inspector.create({
    data: {
      name: `Insp ${n}`,
      email: `insp-${n}-${Math.random().toString(36).slice(2, 8)}@inspectors.test`,
      status: 'ACTIVE',
      blocked_clients_json: blockedClients as never,
    },
  });
}

describe('PrismaInspectorRepository tenant-eligibility filtering (DB-level, WI-8)', () => {
  it('returns a full page of eligible rows and a matching count even when blocked inspectors are interleaved', async () => {
    const tenantId = 'tenant-eligible-test';
    const pageSize = 5;

    // 7 inspectors block this tenant (should never surface for it), 6 don't.
    for (let i = 0; i < 7; i += 1) {
      await seedInspector(harness.prisma, i, [tenantId]);
    }
    for (let i = 100; i < 106; i += 1) {
      await seedInspector(harness.prisma, i, []);
    }
    // A legacy row whose blocked-clients entry is an object rather than a
    // plain tenant-id string (the historical shape bug) — must not crash the
    // query and must not spuriously block the tenant.
    await seedInspector(harness.prisma, 200, [{ tenantId, eligible: false }]);

    const filters = { tenantId };
    const page1 = await repo.findAll(filters, {
      page: 1,
      pageSize,
      sortBy: 'created_at',
      sortOrder: 'asc',
    });
    const total = await repo.count(filters);

    // 6 explicitly-eligible + 1 legacy-shaped row = 7 truly eligible inspectors.
    expect(total).toBe(7);
    // Page 1 must come back FULL (pageSize rows), not short, because the
    // eligibility predicate is applied before LIMIT/OFFSET at the DB level.
    expect(page1).toHaveLength(pageSize);
    expect(page1.every((i) => i.isEligibleForTenant(tenantId))).toBe(true);

    const page2 = await repo.findAll(filters, {
      page: 2,
      pageSize,
      sortBy: 'created_at',
      sortOrder: 'asc',
    });
    // Remaining eligible rows on page 2 (7 total - 5 on page 1 = 2).
    expect(page2).toHaveLength(2);

    const allReturnedIds = new Set([...page1, ...page2].map((i) => i.id));
    expect(allReturnedIds.size).toBe(7);
  });
});
