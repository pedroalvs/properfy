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

/**
 * Real-DB regression for the tenant-scoped `activeServiceGroups` quick stat.
 *
 * Service groups are cross-tenant (no `tenant_id`); the tenant-scoped dashboard
 * counts groups holding at least one of the tenant's NON-deleted appointments.
 * A mock would return rows regardless of the WHERE clause, so this must run
 * against real Postgres to guard the `appointments.some { tenant_id, deleted_at }`
 * filter (and the DRAFT/PUBLISHED/ACCEPTED status gate).
 */
describe('Dashboard active-service-groups quick stat (per tenant)', () => {
  async function seedTenantFull(name: string) {
    const suffix = Math.random().toString(36).slice(2, 10);
    const tenant = await harness.prisma.tenant.create({
      data: { name, legal_name: `${name} LLC ${suffix}`, status: 'ACTIVE' },
    });
    const branch = await harness.prisma.branch.create({
      data: { tenant_id: tenant.id, name: `${name} Branch`, status: 'ACTIVE' },
    });
    const user = await harness.prisma.user.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branch.id,
        role: 'OP',
        name: `${name} Actor`,
        email: `dash-sg-${suffix}@test.local`,
        password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
        status: 'ACTIVE',
      },
    });
    const property = await harness.prisma.property.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branch.id,
        property_code: `DSG-${suffix}`,
        type: 'HOUSE',
        street: '1 Test St',
        suburb: 'Test',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        geocoding_status: 'SUCCESS',
      },
    });
    return { tenantId: tenant.id, branchId: branch.id, userId: user.id, propertyId: property.id };
  }

  async function seedAppt(
    fx: { tenantId: string; branchId: string; propertyId: string; userId: string },
    serviceTypeId: string,
    status: string,
    serviceGroupId: string,
    deletedAt: Date | null = null,
  ) {
    await harness.prisma.appointment.create({
      data: {
        tenant_id: fx.tenantId,
        branch_id: fx.branchId,
        property_id: fx.propertyId,
        service_type_id: serviceTypeId,
        service_group_id: serviceGroupId,
        status: status as never,
        scheduled_date: new Date('2026-07-15'),
        time_slot_start: '09:00',
        time_slot_end: '10:00',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        rental_tenant_confirmation_status: 'PENDING',
        created_by_user_id: fx.userId,
        deleted_at: deletedAt,
      },
    });
  }

  it('counts only active-status groups with a NON-deleted appointment for the tenant', async () => {
    // Own clean slate: service_groups/service_types are not tenant-scoped, so the
    // suite-wide `TRUNCATE inspectors, tenants` does not clear them.
    await harness.prisma.$executeRawUnsafe(
      `TRUNCATE TABLE tenants, service_groups, service_types CASCADE`,
    );

    const a = await seedTenantFull('DSG Tenant A');
    const b = await seedTenantFull('DSG Tenant B');

    const stSuffix = Math.random().toString(36).slice(2, 10);
    const st = await harness.prisma.serviceType.create({
      data: {
        code: `DSG-ST-${stSuffix}`,
        name: `DSG Routine ${stSuffix}`,
        flow_type: 'ROUTINE',
        requires_rental_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });

    const mkGroup = (status: string, date: string) =>
      harness.prisma.serviceGroup.create({
        data: {
          service_type_id: st.id,
          status: status as never,
          group_size: 4,
          scheduled_date: new Date(date),
          time_window: '09:00-10:00',
          created_by_user_id: a.userId,
        },
      });

    const g1 = await mkGroup('PUBLISHED', '2026-07-15'); // A active (+ B active) -> counts for A
    const g2 = await mkGroup('DRAFT', '2026-07-16'); // A soft-deleted only -> NOT for A
    const g3 = await mkGroup('PUBLISHED', '2026-07-17'); // B only -> NOT for A
    const g4 = await mkGroup('CANCELLED', '2026-07-18'); // A active but terminal status -> excluded

    await seedAppt(a, st.id, 'SCHEDULED', g1.id);
    await seedAppt(b, st.id, 'AWAITING_INSPECTOR', g1.id);
    await seedAppt(a, st.id, 'SCHEDULED', g2.id, new Date()); // soft-deleted
    await seedAppt(b, st.id, 'SCHEDULED', g3.id);
    await seedAppt(a, st.id, 'SCHEDULED', g4.id);

    // Tenant A: only g1 (g2's only A-appt is soft-deleted; g3 has no A-appt; g4 is CANCELLED)
    const tenantAStats = await repo.getStats(a.tenantId);
    expect(tenantAStats.quickStats.activeServiceGroups).toBe(1);

    // AM (no tenant scope): all active-status groups regardless of appointments
    // -> g1 + g2 + g3 (DRAFT/PUBLISHED); g4 CANCELLED excluded
    const amStats = await repo.getStats(undefined);
    expect(amStats.quickStats.activeServiceGroups).toBe(3);
  }, 60_000);
});
