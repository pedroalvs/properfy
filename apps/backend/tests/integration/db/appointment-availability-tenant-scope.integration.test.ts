/**
 * Real-database test for the tenant scope `SetRentalTenantAvailabilityUseCase`
 * relies on.
 *
 * The unit test for that use case mocks `findById`, and a mock returns its
 * configured value regardless of the `tenantId` argument — so it proves only
 * that the use case compares ids in memory, never that the SQL carries
 * `WHERE tenant_id = $2`. If the repository lost that predicate, the unit test
 * would stay green while a CL_ADMIN could write availability onto another
 * agency's appointment. Same trap as BUG-024-002; see
 * `feedback_mock_masks_real_bug.md`.
 *
 * Requires Docker (testcontainers). Run a single file with:
 *   pnpm exec vitest run --config vitest.integration-db.config.ts \
 *     tests/integration/db/appointment-availability-tenant-scope.integration.test.ts
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
    `TRUNCATE TABLE appointment_restrictions, appointments, properties, service_types, users, branches, tenants CASCADE`,
  );
});

const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const rand = () => Math.random().toString(36).slice(2, 10);

async function seedAppointmentFor(prisma: PrismaClient, tenantId: string): Promise<string> {
  const branch = await prisma.branch.findFirst({ where: { tenant_id: tenantId } });
  if (!branch) throw new Error('Branch not found for tenant');
  const user = await prisma.user.findFirst({ where: { tenant_id: tenantId } });
  if (!user) throw new Error('User not found for tenant');

  const serviceType = await prisma.serviceType.create({
    data: {
      code: `ST-${rand()}`, name: `Routine ${rand()}`, flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true, status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenantId, branch_id: branch.id, property_code: `P-${rand()}`,
      type: 'HOUSE', street: '1 Test St', suburb: 'Sydney', postcode: '2000', state: 'NSW',
    },
  });
  const appt = await prisma.appointment.create({
    data: {
      tenant_id: tenantId, branch_id: branch.id, property_id: property.id,
      service_type_id: serviceType.id, status: 'SCHEDULED',
      scheduled_date: FUTURE_DATE, time_slot_start: '09:00', time_slot_end: '12:00',
      price_amount: '100.00', payout_amount: '80.00', pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING', created_by_user_id: user.id,
    },
  });
  return appt.id;
}

describe('PrismaAppointmentRepository.findById — tenant scope behind the availability command', () => {
  it("does not return another agency's appointment when scoped to a tenant", async () => {
    const tenantA = await seedTenant(harness.prisma, `Agency A ${rand()}`);
    const tenantB = await seedTenant(harness.prisma, `Agency B ${rand()}`);
    const apptOfA = await seedAppointmentFor(harness.prisma, tenantA.tenantId);

    // What a CL_ADMIN of B triggers: findById(id, actor.tenantId).
    const asB = await repo.findById(apptOfA, tenantB.tenantId);
    expect(asB).toBeNull();

    // Sanity: the row exists and is reachable by its owner, so the null above
    // is the tenant filter doing its job rather than a bad fixture.
    const asA = await repo.findById(apptOfA, tenantA.tenantId);
    expect(asA).not.toBeNull();
    expect(asA!.appointment.tenantId).toBe(tenantA.tenantId);
  });

  it('returns the appointment cross-tenant when scope is null (AM/OP)', async () => {
    const tenantA = await seedTenant(harness.prisma, `Agency A ${rand()}`);
    const apptOfA = await seedAppointmentFor(harness.prisma, tenantA.tenantId);

    const asPlatform = await repo.findById(apptOfA, null);
    expect(asPlatform).not.toBeNull();
    expect(asPlatform!.appointment.tenantId).toBe(tenantA.tenantId);
  });

  it('round-trips the availability written by the operator command', async () => {
    // Proves the JSON column survives the delete+insert of `replaceRestrictions`
    // and rehydrates as an array, not a string.
    const tenantA = await seedTenant(harness.prisma, `Agency A ${rand()}`);
    const apptOfA = await seedAppointmentFor(harness.prisma, tenantA.tenantId);

    const { AppointmentRestrictionEntity } = await import(
      '../../../src/modules/appointment/domain/appointment-restriction.entity'
    );
    await repo.replaceRestrictions(
      apptOfA,
      new AppointmentRestrictionEntity({
        id: crypto.randomUUID(),
        appointmentId: apptOfA,
        isHome: false,
        unavailableDaysJson: null,
        unavailableHoursJson: null,
        availableSlotsJson: [{ dayOfWeek: 'MON', start: '09:00', end: '12:00' }],
        notes: null,
        source: 'RENTAL_TENANT_PORTAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const reloaded = await repo.findById(apptOfA, tenantA.tenantId);
    expect(reloaded!.restrictions[0]!.availableSlotsJson).toEqual([
      { dayOfWeek: 'MON', start: '09:00', end: '12:00' },
    ]);

    // And the flattened list field the map's Confirm column reads.
    const listed = await repo.findAll(
      { tenantId: tenantA.tenantId },
      { page: 1, pageSize: 20, sortOrder: 'asc' },
    );
    expect(listed[0]!.rentalTenantAvailableSlots).toEqual([
      { dayOfWeek: 'MON', start: '09:00', end: '12:00' },
    ]);
  });
});
