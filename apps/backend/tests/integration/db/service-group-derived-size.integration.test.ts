/**
 * `groupSize` is derived from the linked appointments — real-database verification.
 *
 * Background: `service_groups.group_size` used to be a denormalized counter
 * written once at creation and never maintained. It drifted in both directions
 * (measured at 24 of 32 production groups wrong) because no write path touched
 * it again: adding appointments never incremented it, and unlinking them on
 * cancel/reject never zeroed it.
 *
 * These tests MUST run against a real PostgreSQL database. A mocked repository
 * returns whatever the mock says regardless of what the SQL does, which is
 * precisely the class of bug being fixed here — the drift lived in the query,
 * not in the use case.
 *
 * What's covered:
 *   1. The count follows linking: a group reads back the number of appointments
 *      actually pointing at it, not the number it was created with.
 *   2. The count follows UNlinking: cancelling a group (which clears
 *      `service_group_id`) drops it to 0.
 *   3. Soft-deleted appointments do not count. `delete-appointment` sets
 *      `deleted_at` WITHOUT clearing `service_group_id`, so the row stays
 *      linked — every count in the system must exclude it.
 *   4. `findById` and `findAll` agree, and `findById`'s count matches the
 *      `appointments` array it returns in the same payload.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { AddAppointmentsToGroupUseCase } from '../../../src/modules/service-group/application/use-cases/add-appointments-to-group.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';

function silentAuditService(): AuditService {
  return { log: () => {} } as unknown as AuditService;
}

interface Fixture {
  tenantId: string;
  branchId: string;
  userId: string;
  propertyId: string;
  serviceTypeId: string;
}

async function seedFixture(prisma: PrismaClient): Promise<Fixture> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const tenant = await prisma.tenant.create({
    data: { name: `Derived Size ${suffix}`, legal_name: `Derived Size LLC ${suffix}`, status: 'ACTIVE' },
  });
  const branch = await prisma.branch.create({
    data: { tenant_id: tenant.id, name: `Branch ${suffix}`, status: 'ACTIVE' },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      role: 'OP',
      name: `Actor ${suffix}`,
      email: `derived-size-${suffix}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      property_code: `DSZ-${suffix}`,
      type: 'HOUSE',
      street: '1 Derived St',
      suburb: 'Testville',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  const serviceType = await prisma.serviceType.create({
    data: {
      code: `DSZ-ST-${suffix}`,
      name: `Derived Routine ${suffix}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  return {
    tenantId: tenant.id,
    branchId: branch.id,
    userId: user.id,
    propertyId: property.id,
    serviceTypeId: serviceType.id,
  };
}

describe('service group size is derived from linked appointments (real DB)', () => {
  let harness: DbHarness | undefined;
  let fx: Fixture;
  let repo: PrismaServiceGroupRepository;

  beforeAll(async () => {
    harness = await setupDbHarness();
    fx = await seedFixture(harness.prisma);
    repo = new PrismaServiceGroupRepository(harness.prisma);
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function prisma(): PrismaClient {
    if (!harness) throw new Error('harness not initialized');
    return harness.prisma;
  }

  async function createGroup(status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED'): Promise<string> {
    const group = await prisma().serviceGroup.create({
      data: {
        service_type_id: fx.serviceTypeId,
        status,
        scheduled_date: new Date('2026-08-12'),
        time_window: '09:00-10:00',
        created_by_user_id: fx.userId,
      },
    });
    return group.id;
  }

  async function createAppointment(groupId: string | null): Promise<string> {
    const appt = await prisma().appointment.create({
      data: {
        tenant_id: fx.tenantId,
        branch_id: fx.branchId,
        property_id: fx.propertyId,
        service_type_id: fx.serviceTypeId,
        service_group_id: groupId,
        status: 'AWAITING_INSPECTOR',
        scheduled_date: new Date('2026-08-12'),
        time_slot_start: '09:00',
        time_slot_end: '10:00',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        rental_tenant_confirmation_status: 'PENDING',
        created_by_user_id: fx.userId,
      },
    });
    return appt.id;
  }

  async function sizeViaFindById(groupId: string): Promise<number> {
    const found = await repo.findById(groupId, null);
    if (!found) throw new Error(`group ${groupId} not found`);
    return found.group.groupSize;
  }

  async function sizeViaFindAll(groupId: string): Promise<number> {
    const rows = await repo.findAll(
      {},
      { page: 1, pageSize: 200, sortBy: 'createdAt', sortOrder: 'desc' },
    );
    const row = rows.find((r) => r.group.id === groupId);
    if (!row) throw new Error(`group ${groupId} not in findAll page`);
    return row.group.groupSize;
  }

  it('counts the appointments actually linked to the group', async () => {
    const groupId = await createGroup();
    await createAppointment(groupId);
    await createAppointment(groupId);
    await createAppointment(groupId);

    expect(await sizeViaFindById(groupId)).toBe(3);
    expect(await sizeViaFindAll(groupId)).toBe(3);
  });

  it('drops to zero when the group is emptied by unlinkAppointments (the cancel path)', async () => {
    const groupId = await createGroup();
    await createAppointment(groupId);
    await createAppointment(groupId);
    expect(await sizeViaFindById(groupId)).toBe(2);

    // What cancel-service-group / reject-service-group actually do.
    await repo.unlinkAppointments(groupId);

    expect(await sizeViaFindById(groupId)).toBe(0);
    expect(await sizeViaFindAll(groupId)).toBe(0);
  });

  it('grows when appointments are linked into an existing group', async () => {
    const groupId = await createGroup();
    await createAppointment(groupId);
    expect(await sizeViaFindById(groupId)).toBe(1);

    const loose1 = await createAppointment(null);
    const loose2 = await createAppointment(null);
    await repo.linkAppointments([loose1, loose2], groupId);

    expect(await sizeViaFindById(groupId)).toBe(3);
    expect(await sizeViaFindAll(groupId)).toBe(3);
  });

  it('excludes soft-deleted appointments, which stay linked to the group', async () => {
    const groupId = await createGroup();
    const keep = await createAppointment(groupId);
    const doomed = await createAppointment(groupId);
    expect(await sizeViaFindById(groupId)).toBe(2);

    // delete-appointment.use-case sets deleted_at and does NOT clear
    // service_group_id — the row remains linked, so only the filter saves us.
    await prisma().appointment.update({
      where: { id: doomed },
      data: { deleted_at: new Date() },
    });
    const stillLinked = await prisma().appointment.findUnique({
      where: { id: doomed },
      select: { service_group_id: true },
    });
    expect(stillLinked?.service_group_id).toBe(groupId);

    expect(await sizeViaFindById(groupId)).toBe(1);
    expect(await sizeViaFindAll(groupId)).toBe(1);

    // ...and the detail payload's own array agrees with its own count, so the
    // UI can never render "1 appointment" above a list of two.
    const found = await repo.findById(groupId, null);
    expect(found?.appointments.map((a) => a.id)).toEqual([keep]);
    expect(found?.group.groupSize).toBe(found?.appointments.length);
  });

  it('reports zero for a group that never had appointments', async () => {
    const groupId = await createGroup('DRAFT');
    expect(await sizeViaFindById(groupId)).toBe(0);
    expect(await sizeViaFindAll(groupId)).toBe(0);
  });

  // The membership array `findById` returns is not just for display: five use
  // cases read it. This is the one where the difference is directly
  // observable — the capacity cap counts `found.appointments.length`, so
  // before the filter a soft-deleted appointment permanently consumed a slot
  // in the group and nobody could take it back.
  it('does not let a soft-deleted appointment consume a capacity slot', async () => {
    const groupId = await createGroup('DRAFT');

    // Fill to exactly the cap (30), then delete one — 30 linked rows, 29 live.
    for (let i = 0; i < 30; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const id = await createAppointment(groupId);
      if (i === 0) {
        // eslint-disable-next-line no-await-in-loop
        await prisma().appointment.update({ where: { id }, data: { deleted_at: new Date() } });
      }
    }
    expect(await sizeViaFindById(groupId)).toBe(29);

    const newcomer = await createAppointment(null);
    const useCase = new AddAppointmentsToGroupUseCase(
      repo,
      new PrismaAppointmentRepository(prisma()),
      silentAuditService(),
      new AuthorizationService(silentAuditService()),
    );

    const result = await useCase.execute({
      groupId,
      appointmentIds: [newcomer],
      actor: { userId: fx.userId, tenantId: null, role: 'AM', branchId: null, inspectorId: null },
    });

    // Counting the deleted row would have returned GROUP_CAPACITY_EXCEEDED.
    expect(result.results[0]).toMatchObject({ appointmentId: newcomer, status: 'OK' });
    expect(await sizeViaFindById(groupId)).toBe(30);
  });
});
