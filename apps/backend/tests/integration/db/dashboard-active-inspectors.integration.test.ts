/**
 * Real-database test for the per-tenant "active inspectors" quick stat.
 *
 * Regression guard for the bug where the dashboard counted active inspectors
 * by reading the legacy `client_eligibility_json` allow-list cast as
 * `string[]` and calling `.includes(tenantId)`. The stored value is an array
 * of objects (`{ tenantId, eligible }`), so `.includes` never matched and the
 * stat was effectively always 0.
 *
 * The canonical model is the `blocked_clients_json` deny-list: an ACTIVE
 * inspector is "available" to a tenant unless that tenant is in its block list.
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend test:integration:db
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaDashboardRepository } from '../../../src/modules/dashboard/infrastructure/prisma-dashboard.repository';

let harness: DbHarness;
let repo: PrismaDashboardRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaDashboardRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE inspectors, tenants CASCADE`,
  );
});

async function seedTenant(prisma: PrismaClient, name: string): Promise<string> {
  const t = await prisma.tenant.create({
    data: {
      name,
      legal_name: `${name} LLC ${Math.random().toString(36).slice(2, 10)}`,
      status: 'ACTIVE',
    },
  });
  return t.id;
}

async function seedInspector(
  prisma: PrismaClient,
  opts: { status?: 'ACTIVE' | 'INACTIVE'; blockedClients?: string[] } = {},
): Promise<void> {
  await prisma.inspector.create({
    data: {
      name: `Insp ${Math.random().toString(36).slice(2, 8)}`,
      email: `insp-${Math.random().toString(36).slice(2, 10)}@inspectors.test`,
      status: opts.status ?? 'ACTIVE',
      blocked_clients_json: opts.blockedClients ?? [],
    },
  });
}

describe('Dashboard active-inspectors quick stat (per tenant)', () => {
  it('counts ACTIVE inspectors that do NOT block the tenant', async () => {
    const tenantId = await seedTenant(harness.prisma, 'Acme');

    // Available to the tenant (not blocked)
    await seedInspector(harness.prisma, { blockedClients: [] });
    await seedInspector(harness.prisma, { blockedClients: ['some-other-tenant'] });
    // Blocks this tenant -> excluded
    await seedInspector(harness.prisma, { blockedClients: [tenantId] });
    // Inactive -> excluded regardless of block list
    await seedInspector(harness.prisma, { status: 'INACTIVE', blockedClients: [] });

    const stats = await repo.getStats(tenantId);

    expect(stats.quickStats.activeInspectors).toBe(2);
  });

  it('without a tenant scope (AM), counts all ACTIVE inspectors', async () => {
    await seedInspector(harness.prisma, { blockedClients: [] });
    await seedInspector(harness.prisma, { blockedClients: ['t-1'] });
    await seedInspector(harness.prisma, { status: 'INACTIVE' });

    const stats = await repo.getStats(undefined);

    expect(stats.quickStats.activeInspectors).toBe(2);
  });
});
