/**
 * QA-006-HIGH-001: bulk-edit branchId → real database round-trip.
 *
 * The existing mock-based tests in `tests/integration/appointment/` verify that
 * the repository's `update()` method includes `branch_id` in the Prisma
 * `updateMany` payload. This test goes one layer deeper: it writes to a real
 * PostgreSQL database and reads back the result, proving that the camelCase →
 * snake_case mapping actually persists `branch_id` (not silently dropped).
 *
 * Steps:
 *   1. Seed Tenant → Branch A → Branch B → User → Property → ServiceType →
 *      Appointment (DRAFT, assigned to Branch A).
 *   2. Call `PrismaAppointmentRepository.update()` with `{ branchId: branchB.id }`.
 *   3. Call `PrismaAppointmentRepository.findById()` and assert that
 *      `appointment.branchId === branchB.id`.
 *
 * This is the spec-required "GET confirms branchId changed in DB" round-trip.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';

describe('QA-006-HIGH-001: bulk-edit branchId round-trip (real DB)', () => {
  let harness: DbHarness | undefined;

  beforeAll(async () => {
    harness = await setupDbHarness();
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  it('persists branchId change to the database and GET returns the new value', async () => {
    if (!harness) throw new Error('harness not initialized');
    const { prisma } = harness;

    // ─── Seed: Tenant ──────────────────────────────────────────────────────
    const tenant = await prisma.tenant.create({
      data: {
        name: 'QA-006 Bulk-Edit Tenant',
        legal_name: `QA-006 LLC ${Math.random().toString(36).slice(2, 10)}`,
        status: 'ACTIVE',
      },
    });

    // ─── Seed: Branch A (original) and Branch B (target) ──────────────────
    const branchA = await prisma.branch.create({
      data: { tenant_id: tenant.id, name: 'Branch A (original)', status: 'ACTIVE' },
    });
    const branchB = await prisma.branch.create({
      data: { tenant_id: tenant.id, name: 'Branch B (target)', status: 'ACTIVE' },
    });

    // ─── Seed: User ───────────────────────────────────────────────────────
    const user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branchA.id,
        role: 'OP',
        name: 'QA-006 Actor',
        email: `qa006-${Math.random().toString(36).slice(2, 10)}@test.local`,
        password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
        status: 'ACTIVE',
      },
    });

    // ─── Seed: Property ───────────────────────────────────────────────────
    const property = await prisma.property.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branchA.id,
        property_code: `QA006-${Math.random().toString(36).slice(2, 10)}`,
        type: 'RESIDENTIAL',
        street: '10 Test St',
        suburb: 'Testville',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        geocoding_status: 'SUCCESS',
      },
    });

    // ─── Seed: ServiceType ────────────────────────────────────────────────
    const serviceType = await prisma.serviceType.create({
      data: {
        code: `QA006-ST-${Math.random().toString(36).slice(2, 10)}`,
        name: 'QA-006 Routine',
        flow_type: 'ROUTINE',
        requires_tenant_confirmation: false,
        status: 'ACTIVE',
      },
    });

    // ─── Seed: Appointment (DRAFT, branch = branchA) ──────────────────────
    const appointment = await prisma.appointment.create({
      data: {
        tenant_id: tenant.id,
        branch_id: branchA.id,
        property_id: property.id,
        service_type_id: serviceType.id,
        status: 'DRAFT',
        scheduled_date: new Date('2027-06-15'),
        time_slot: 'MORNING',
        price_amount: '150.00',
        payout_amount: '100.00',
        pricing_rule_snapshot_json: {},
        tenant_confirmation_status: 'PENDING',
        created_by_user_id: user.id,
      },
    });

    // ─── Step 2: Update branchId via the real repository ──────────────────
    const repo = new PrismaAppointmentRepository(prisma);
    await repo.update(appointment.id, tenant.id, { branchId: branchB.id });

    // ─── Step 3: Read back and assert ─────────────────────────────────────
    const result = await repo.findById(appointment.id, tenant.id);

    expect(result).not.toBeNull();
    expect(result!.appointment.branchId).toBe(branchB.id);
    // Sanity: it is not still pointing at Branch A
    expect(result!.appointment.branchId).not.toBe(branchA.id);
    // Sanity: branchName reflects Branch B
    expect(result!.branchName).toBe('Branch B (target)');
  });
});
