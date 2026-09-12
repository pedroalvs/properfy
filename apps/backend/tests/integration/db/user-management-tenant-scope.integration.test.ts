/**
 * Real-database tenant-scope proof for PrismaUserManagementRepository (#554).
 * The use-case unit tests mock the repository, so a mock returns its configured
 * rows regardless of the tenantId/filter arguments — nothing proves the SQL
 * actually carries `WHERE tenant_id = $1` alongside each filter. This seeds two
 * tenants and drives every filter combination through the real repository,
 * asserting cross-tenant rows never leak. Same trap as the availability
 * tenant-scope test; see feedback_mock_masks_real_bug.md.
 *
 * Run via:
 *   pnpm exec vitest run --config vitest.integration-db.config.ts \
 *     tests/integration/db/user-management-tenant-scope.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { seedTenant } from '../service-region/helpers/service-region-fixtures';
import { PrismaUserManagementRepository } from '../../../src/modules/user/infrastructure/prisma-user-management.repository';

let harness: DbHarness;
let repo: PrismaUserManagementRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaUserManagementRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE users, branches, tenants CASCADE`,
  );
});

const PAGINATION = { page: 1, pageSize: 100, sortOrder: 'asc' as const };

async function seedUser(
  tenantId: string,
  branchId: string | null,
  overrides: { role?: string; status?: 'ACTIVE' | 'INACTIVE'; name?: string; email?: string },
): Promise<void> {
  const id = crypto.randomUUID();
  await harness.prisma.user.create({
    data: {
      id,
      tenant_id: tenantId,
      branch_id: branchId,
      role: (overrides.role ?? 'CL_USER') as never,
      name: overrides.name ?? `User ${id}`,
      email: overrides.email ?? `${id}@x.com`,
      phone: null,
      status: (overrides.status ?? 'ACTIVE') as never,
      password_hash: 'not-a-real-hash',
      totp_enabled: false,
      failed_login_count: 0,
      deleted_at: null,
    },
  });
}

describe('PrismaUserManagementRepository tenant scoping (#554)', () => {
  it('never returns cross-tenant rows under any filter combination', async () => {
    const a = await seedTenant(harness.prisma, 'Agency A');
    const b = await seedTenant(harness.prisma, 'Agency B');

    // Agency A cohort.
    await seedUser(a.tenantId, null, { role: 'CL_ADMIN', status: 'ACTIVE', name: 'Alice Admin', email: 'alice@a.com' });
    await seedUser(a.tenantId, null, { role: 'CL_USER', status: 'INACTIVE', name: 'Aaron User', email: 'aaron@a.com' });
    // Agency B cohort — deliberately same shapes/names to catch a dropped scope.
    await seedUser(b.tenantId, null, { role: 'CL_ADMIN', status: 'ACTIVE', name: 'Alice Admin', email: 'alice@b.com' });
    await seedUser(b.tenantId, null, { role: 'CL_USER', status: 'INACTIVE', name: 'Aaron User', email: 'aaron@b.com' });

    const onlyA = (rows: { tenantId: string | null }[]) =>
      rows.every((r) => r.tenantId === a.tenantId);

    // No filter (seedTenant also creates one user per tenant, so scope is what matters).
    const all = await repo.findByTenantId(a.tenantId, {}, PAGINATION);
    expect(all.length).toBeGreaterThan(0);
    expect(onlyA(all)).toBe(true);
    expect(await repo.countByTenantId(a.tenantId, {})).toBe(all.length);

    // status filter
    const active = await repo.findByTenantId(a.tenantId, { status: 'ACTIVE' }, PAGINATION);
    expect(onlyA(active)).toBe(true);
    expect(active.every((u) => u.status === 'ACTIVE')).toBe(true);

    const inactive = await repo.findByTenantId(a.tenantId, { status: 'INACTIVE' }, PAGINATION);
    expect(onlyA(inactive)).toBe(true);
    expect(inactive.every((u) => u.status === 'INACTIVE')).toBe(true);

    // role filter
    const admins = await repo.findByTenantId(a.tenantId, { role: 'CL_ADMIN' }, PAGINATION);
    expect(onlyA(admins)).toBe(true);
    expect(admins.every((u) => u.role === 'CL_ADMIN')).toBe(true);

    // excludeRoles filter
    const nonAdmins = await repo.findByTenantId(a.tenantId, { excludeRoles: ['CL_ADMIN'] }, PAGINATION);
    expect(onlyA(nonAdmins)).toBe(true);
    expect(nonAdmins.every((u) => u.role !== 'CL_ADMIN')).toBe(true);

    // search — the same name exists in tenant B, so a scope leak would surface here.
    const searched = await repo.findByTenantId(a.tenantId, { search: 'Alice' }, PAGINATION);
    expect(searched.length).toBeGreaterThan(0);
    expect(onlyA(searched)).toBe(true);
    expect(searched.some((u) => u.email === 'alice@b.com')).toBe(false);
    expect(await repo.countByTenantId(a.tenantId, { search: 'Alice' })).toBe(searched.length);
  });
});
