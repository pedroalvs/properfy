/**
 * Custom fields → real database round-trip.
 *
 * Unit tests mock the repository, so the actual JSONB write of the
 * `{ label, value }[]` array (and the null-clear) is only proven here against a
 * real PostgreSQL database:
 *   1. Seed Tenant → Branch → User → Property → ServiceType → Appointment.
 *   2. `repo.update()` with a customFields array → `findById()` returns it.
 *   3. `repo.update()` with `null` → `findById()` returns null (column cleared).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';

describe('appointment customFields round-trip (real DB)', () => {
  let harness: DbHarness | undefined;

  beforeAll(async () => {
    harness = await setupDbHarness();
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('persists a customFields array to JSONB and clears it with null', async () => {
    if (!harness) throw new Error('harness not initialized');
    const { prisma } = harness;
    const rand = () => Math.random().toString(36).slice(2, 10);

    const tenant = await prisma.tenant.create({
      data: { name: 'CF Tenant', legal_name: `CF LLC ${rand()}`, status: 'ACTIVE' },
    });
    const branch = await prisma.branch.create({
      data: { tenant_id: tenant.id, name: 'CF Branch', status: 'ACTIVE' },
    });
    const user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branch.id,
        role: 'OP',
        name: 'CF Actor',
        email: `cf-${rand()}@test.local`,
        password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
        status: 'ACTIVE',
      },
    });
    const property = await prisma.property.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branch.id,
        property_code: `CF-${rand()}`,
        type: 'HOUSE',
        street: '10 Test St',
        suburb: 'Testville',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        geocoding_status: 'SUCCESS',
      },
    });
    const serviceType = await prisma.serviceType.create({
      data: {
        code: `CF-ST-${rand()}`,
        name: 'CF Routine',
        flow_type: 'ROUTINE',
        requires_rental_tenant_confirmation: false,
        status: 'ACTIVE',
      },
    });
    const appointment = await prisma.appointment.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branch.id,
        property_id: property.id,
        service_type_id: serviceType.id,
        status: 'DRAFT',
        scheduled_date: new Date('2027-06-15'),
        time_slot_start: '09:00',
        time_slot_end: '12:00',
        price_amount: '150.00',
        payout_amount: '100.00',
        pricing_rule_snapshot_json: {},
        rental_tenant_confirmation_status: 'PENDING',
        created_by_user_id: user.id,
      },
    });

    const repo = new PrismaAppointmentRepository(prisma);
    const customFields = [
      { label: 'Gate code', value: '1234' },
      { label: 'Parking', value: 'Level 2' },
    ];

    // ─── Write the array ──────────────────────────────────────────────────
    await repo.update(appointment.id, tenant.id, { customFieldsJson: customFields });
    const afterWrite = await repo.findById(appointment.id, tenant.id);
    expect(afterWrite).not.toBeNull();
    expect(afterWrite!.appointment.customFieldsJson).toEqual(customFields);

    // ─── Clear with null ──────────────────────────────────────────────────
    await repo.update(appointment.id, tenant.id, { customFieldsJson: null });
    const afterClear = await repo.findById(appointment.id, tenant.id);
    expect(afterClear!.appointment.customFieldsJson).toBeNull();
  });
});
