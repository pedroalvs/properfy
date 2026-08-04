/**
 * Real-database tests for the appointments-list Suburb filter and the distinct
 * suburb option list behind it.
 *
 * Both are cross-tenant-sensitive reads that a mocked Prisma client cannot
 * prove: `findAll`'s suburb clause reaches through the property relation while
 * `tenant_id` scopes the appointment, and `findDistinctSuburbs` filters on a
 * relation + soft-delete + DISTINCT that only the real planner executes.
 *
 * Requires Docker (testcontainers). Run a single file via:
 *   pnpm exec vitest run --config vitest.integration-db.config.ts \
 *     tests/integration/db/appointment-list-suburb-filter.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { seedTenant } from '../service-region/helpers/service-region-fixtures';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';

let harness: DbHarness;
let repo: PrismaAppointmentRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaAppointmentRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE appointments, properties, service_types, users, branches, tenants CASCADE`,
  );
});

const PAGINATION = { page: 1, pageSize: 20, sortOrder: 'asc' as const };
const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function getBranchId(prisma: PrismaClient, tenantId: string): Promise<string> {
  const branch = await prisma.branch.findFirst({ where: { tenant_id: tenantId } });
  if (!branch) throw new Error('Branch not found for tenant');
  return branch.id;
}

async function seedServiceType(prisma: PrismaClient): Promise<string> {
  const suffix = rand();
  const st = await prisma.serviceType.create({
    data: {
      code: `ST-${suffix}`,
      name: `Routine ${suffix}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  return st.id;
}

async function seedProperty(
  prisma: PrismaClient,
  tenantId: string,
  branchId: string,
  suburb: string,
): Promise<string> {
  const property = await prisma.property.create({
    data: {
      tenant_id: tenantId,
      branch_id: branchId,
      property_code: `P-${rand()}`,
      type: 'HOUSE',
      street: `${rand()} Test St`,
      suburb,
      postcode: '2000',
      state: 'NSW',
    },
  });
  return property.id;
}

async function seedAppointment(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    branchId: string;
    propertyId: string;
    serviceTypeId: string;
    userId: string;
    deleted?: boolean;
  },
): Promise<string> {
  const appt = await prisma.appointment.create({
    data: {
      tenant_id: params.tenantId,
      branch_id: params.branchId,
      property_id: params.propertyId,
      service_type_id: params.serviceTypeId,
      status: 'DRAFT',
      scheduled_date: FUTURE_DATE,
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: params.userId,
      ...(params.deleted ? { deleted_at: new Date() } : {}),
    },
  });
  return appt.id;
}

describe('PrismaAppointmentRepository.findAll — suburb filter', () => {
  it('narrows to the matching suburb without leaking another tenant', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const bondiProperty = await seedProperty(harness.prisma, tenantId, branchId, 'Bondi');
    const newtownProperty = await seedProperty(harness.prisma, tenantId, branchId, 'Newtown');

    const bondiId = await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId: bondiProperty, serviceTypeId, userId,
    });
    await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId: newtownProperty, serviceTypeId, userId,
    });

    // A second tenant with an appointment in the SAME suburb — the suburb
    // predicate must AND with tenant_id, not replace it.
    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'Agency B');
    const branchB = await getBranchId(harness.prisma, tenantB);
    const bondiPropertyB = await seedProperty(harness.prisma, tenantB, branchB, 'Bondi');
    const tenantBBondiId = await seedAppointment(harness.prisma, {
      tenantId: tenantB, branchId: branchB, propertyId: bondiPropertyB, serviceTypeId, userId: userB,
    });

    const results = await repo.findAll({ tenantId, suburb: 'Bondi' }, PAGINATION);

    expect(results.map((i) => i.appointment.id)).toEqual([bondiId]);
    expect(results.some((i) => i.appointment.id === tenantBBondiId)).toBe(false);
  });

  it('matches case-insensitively', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const propertyId = await seedProperty(harness.prisma, tenantId, branchId, 'Surry Hills');
    const apptId = await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId, serviceTypeId, userId,
    });

    const results = await repo.findAll({ tenantId, suburb: 'surry hills' }, PAGINATION);

    expect(results.map((i) => i.appointment.id)).toEqual([apptId]);
  });

  it('combines with search instead of one clobbering the other', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const bondiProperty = await seedProperty(harness.prisma, tenantId, branchId, 'Bondi');
    const newtownProperty = await seedProperty(harness.prisma, tenantId, branchId, 'Newtown');
    await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId: bondiProperty, serviceTypeId, userId,
    });
    await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId: newtownProperty, serviceTypeId, userId,
    });

    // `search` also emits a property predicate (nested in its OR). Searching a
    // suburb that exists while filtering a different one must yield nothing —
    // proof the two AND rather than the later overwriting the earlier.
    const results = await repo.findAll(
      { tenantId, suburb: 'Bondi', search: 'Newtown' },
      PAGINATION,
    );

    expect(results).toHaveLength(0);
  });
});

describe('PrismaAppointmentRepository.findDistinctSuburbs', () => {
  it('returns each suburb once, sorted, scoped to the tenant', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);

    // Two properties in the same suburb — DISTINCT must collapse them.
    for (const suburb of ['Newtown', 'Bondi', 'Bondi']) {
      const propertyId = await seedProperty(harness.prisma, tenantId, branchId, suburb);
      await seedAppointment(harness.prisma, {
        tenantId, branchId, propertyId, serviceTypeId, userId,
      });
    }

    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'Agency B');
    const branchB = await getBranchId(harness.prisma, tenantB);
    const propertyB = await seedProperty(harness.prisma, tenantB, branchB, 'Manly');
    await seedAppointment(harness.prisma, {
      tenantId: tenantB, branchId: branchB, propertyId: propertyB, serviceTypeId, userId: userB,
    });

    const scoped = await repo.findDistinctSuburbs(tenantId);
    expect(scoped).toEqual(['Bondi', 'Newtown']);

    // Cross-tenant (AM/OP) sees the union.
    const all = await repo.findDistinctSuburbs();
    expect(all).toEqual(['Bondi', 'Manly', 'Newtown']);
  });

  it('omits suburbs whose only appointments are soft-deleted', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);

    const liveProperty = await seedProperty(harness.prisma, tenantId, branchId, 'Bondi');
    await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId: liveProperty, serviceTypeId, userId,
    });

    const deletedOnlyProperty = await seedProperty(harness.prisma, tenantId, branchId, 'Newtown');
    await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId: deletedOnlyProperty, serviceTypeId, userId, deleted: true,
    });

    const suburbs = await repo.findDistinctSuburbs(tenantId);

    // Offering "Newtown" would hand the operator a filter that returns nothing.
    expect(suburbs).toEqual(['Bondi']);
  });

  // A blank option in the dropdown carries value '' — the same sentinel the
  // "All" entry uses — so picking it would silently clear the filter.
  it('omits blank suburbs', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);

    const named = await seedProperty(harness.prisma, tenantId, branchId, 'Bondi');
    await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId: named, serviceTypeId, userId,
    });
    const blank = await seedProperty(harness.prisma, tenantId, branchId, '');
    await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId: blank, serviceTypeId, userId,
    });

    expect(await repo.findDistinctSuburbs(tenantId)).toEqual(['Bondi']);
  });

  it('omits properties with no appointments at all', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);

    const withAppointment = await seedProperty(harness.prisma, tenantId, branchId, 'Bondi');
    await seedAppointment(harness.prisma, {
      tenantId, branchId, propertyId: withAppointment, serviceTypeId, userId,
    });
    await seedProperty(harness.prisma, tenantId, branchId, 'Newtown');

    const suburbs = await repo.findDistinctSuburbs(tenantId);

    expect(suburbs).toEqual(['Bondi']);
  });
});
