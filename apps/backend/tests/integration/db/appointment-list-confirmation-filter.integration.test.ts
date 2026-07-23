/**
 * Real-database test for the multi-value rentalTenantConfirmationStatus filter.
 *
 * `PrismaAppointmentRepository.findAll` translates the filter into a
 * `rental_tenant_confirmation_status IN (...)` clause. A single value must
 * narrow to matching rows only; multiple values must return the union.
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend test:integration:db
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

async function seedProperty(prisma: PrismaClient, tenantId: string, branchId: string): Promise<string> {
  const property = await prisma.property.create({
    data: {
      tenant_id: tenantId,
      branch_id: branchId,
      property_code: `P-${rand()}`,
      type: 'HOUSE',
      street: '1 Test St',
      suburb: 'Sydney',
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
    confirmationStatus: 'PENDING' | 'CONFIRMED' | 'UNAVAILABLE' | 'NO_RESPONSE';
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
      time_slot_start: '09:00', time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: params.confirmationStatus,
      created_by_user_id: params.userId,
    },
  });
  return appt.id;
}

describe('PrismaAppointmentRepository.findAll — rentalTenantConfirmationStatus IN filter', () => {
  it('narrows to a single status and returns the union for multiple statuses', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency A');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const propertyId = await seedProperty(harness.prisma, tenantId, branchId);
    const base = { tenantId, branchId, propertyId, serviceTypeId, userId } as const;

    const confirmedId = await seedAppointment(harness.prisma, { ...base, confirmationStatus: 'CONFIRMED' });
    const pendingId = await seedAppointment(harness.prisma, { ...base, confirmationStatus: 'PENDING' });
    const noResponseId = await seedAppointment(harness.prisma, { ...base, confirmationStatus: 'NO_RESPONSE' });

    const confirmedOnly = await repo.findAll(
      { tenantId, rentalTenantConfirmationStatus: ['CONFIRMED'] },
      PAGINATION,
    );
    expect(confirmedOnly.map((i) => i.appointment.id)).toEqual([confirmedId]);

    const notConfirmed = await repo.findAll(
      { tenantId, rentalTenantConfirmationStatus: ['PENDING', 'NO_RESPONSE'] },
      PAGINATION,
    );
    expect(notConfirmed.map((i) => i.appointment.id).sort()).toEqual([pendingId, noResponseId].sort());
  });
});
