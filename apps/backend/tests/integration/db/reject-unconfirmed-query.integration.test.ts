import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';

interface Fixture {
  tenantId: string;
  branchId: string;
  userId: string;
  propertyId: string;
  routineConfRequiredServiceTypeId: string;
  routineNoConfServiceTypeId: string;
  nonRoutineServiceTypeId: string;
}

async function seedFixture(prisma: PrismaClient): Promise<Fixture> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const tenant = await prisma.tenant.create({
    data: { name: `RejectQuery ${suffix}`, legal_name: `RejectQuery LLC ${suffix}`, status: 'ACTIVE' },
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
      email: `reject-${suffix}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      property_code: `RJQ-${suffix}`,
      type: 'HOUSE',
      street: '100 Reject Query St',
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      geocoding_status: 'SUCCESS',
      lat: -33.8688,
      lng: 151.2093,
    },
  });

  const st1 = await prisma.serviceType.create({
    data: {
      code: `ROUTINE_CONF_${suffix}`,
      name: `Routine Conf ${suffix}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });

  const st2 = await prisma.serviceType.create({
    data: {
      code: `ROUTINE_NOCONF_${suffix}`,
      name: `Routine NoConf ${suffix}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: false,
      status: 'ACTIVE',
    },
  });

  const st3 = await prisma.serviceType.create({
    data: {
      code: `INGOING_${suffix}`,
      name: `Ingoing ${suffix}`,
      flow_type: 'INGOING',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });

  return {
    tenantId: tenant.id,
    branchId: branch.id,
    userId: user.id,
    propertyId: property.id,
    routineConfRequiredServiceTypeId: st1.id,
    routineNoConfServiceTypeId: st2.id,
    nonRoutineServiceTypeId: st3.id,
  };
}

describe('PrismaAppointmentRepository.findUnconfirmedForDate (real DB)', () => {
  let harness: DbHarness;

  beforeAll(async () => {
    harness = await setupDbHarness();
  });

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('filters out key-required, non-routine, and confirmation-exempt appointments', async () => {
    const fixture = await seedFixture(harness.prisma);
    const repo = new PrismaAppointmentRepository(harness.prisma);

    const targetDate = new Date('2026-06-15T00:00:00.000Z');

    // 1. ROUTINE + requires_rental_tenant_confirmation + key_required=false (ELIGIBLE FOR AUTO-REJECT)
    const apptEligible = await harness.prisma.appointment.create({
      data: {
        tenant_id: fixture.tenantId,
        branch_id: fixture.branchId,
        property_id: fixture.propertyId,
        service_type_id: fixture.routineConfRequiredServiceTypeId,
        scheduled_date: targetDate,
        time_slot_start: '09:00',
        time_slot_end: '10:00',
        status: 'AWAITING_INSPECTOR',
        key_required: false,
        rental_tenant_confirmation_status: 'PENDING',
        price_amount: 150.00,
        payout_amount: 100.00,
        pricing_rule_snapshot_json: {},
        created_by_user_id: fixture.userId,
      },
    });

    // 2. ROUTINE + requires_rental_tenant_confirmation + key_required=true (EXCLUDED)
    await harness.prisma.appointment.create({
      data: {
        tenant_id: fixture.tenantId,
        branch_id: fixture.branchId,
        property_id: fixture.propertyId,
        service_type_id: fixture.routineConfRequiredServiceTypeId,
        scheduled_date: targetDate,
        time_slot_start: '10:00',
        time_slot_end: '11:00',
        status: 'AWAITING_INSPECTOR',
        key_required: true,
        rental_tenant_confirmation_status: 'PENDING',
        price_amount: 150.00,
        payout_amount: 100.00,
        pricing_rule_snapshot_json: {},
        created_by_user_id: fixture.userId,
      },
    });

    // 3. ROUTINE + requires_rental_tenant_confirmation=false + key_required=false (EXCLUDED)
    await harness.prisma.appointment.create({
      data: {
        tenant_id: fixture.tenantId,
        branch_id: fixture.branchId,
        property_id: fixture.propertyId,
        service_type_id: fixture.routineNoConfServiceTypeId,
        scheduled_date: targetDate,
        time_slot_start: '11:00',
        time_slot_end: '12:00',
        status: 'AWAITING_INSPECTOR',
        key_required: false,
        rental_tenant_confirmation_status: 'PENDING',
        price_amount: 150.00,
        payout_amount: 100.00,
        pricing_rule_snapshot_json: {},
        created_by_user_id: fixture.userId,
      },
    });

    // 4. INGOING (non-ROUTINE) + key_required=false (EXCLUDED)
    await harness.prisma.appointment.create({
      data: {
        tenant_id: fixture.tenantId,
        branch_id: fixture.branchId,
        property_id: fixture.propertyId,
        service_type_id: fixture.nonRoutineServiceTypeId,
        scheduled_date: targetDate,
        time_slot_start: '13:00',
        time_slot_end: '14:00',
        status: 'AWAITING_INSPECTOR',
        key_required: false,
        rental_tenant_confirmation_status: 'PENDING',
        price_amount: 150.00,
        payout_amount: 100.00,
        pricing_rule_snapshot_json: {},
        created_by_user_id: fixture.userId,
      },
    });

    // 5. Already CONFIRMED appointment (EXCLUDED)
    await harness.prisma.appointment.create({
      data: {
        tenant_id: fixture.tenantId,
        branch_id: fixture.branchId,
        property_id: fixture.propertyId,
        service_type_id: fixture.routineConfRequiredServiceTypeId,
        scheduled_date: targetDate,
        time_slot_start: '14:00',
        time_slot_end: '15:00',
        status: 'SCHEDULED',
        key_required: false,
        rental_tenant_confirmation_status: 'CONFIRMED',
        price_amount: 150.00,
        payout_amount: 100.00,
        pricing_rule_snapshot_json: {},
        created_by_user_id: fixture.userId,
      },
    });

    const unconfirmed = await repo.findUnconfirmedForDate(targetDate);
    const unconfirmedIds = unconfirmed.map((a) => a.id);

    expect(unconfirmedIds).toContain(apptEligible.id);
    expect(unconfirmedIds).toHaveLength(1);
  });
});
