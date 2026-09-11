/**
 * PrismaAppointmentChecker — tenant scoping, real database verification.
 *
 * `hasOpenAppointmentsForBranch` / `hasOpenAppointmentsForProperty` previously
 * queried `appointment.count` with only `branch_id` / `property_id` and no
 * `tenant_id` filter — the contract itself made tenant scoping impossible,
 * violating "no business query without tenant scope" (closes #515, #663).
 *
 * A mocked test cannot prove this: a mocked `count` returns a fixed number
 * regardless of the `where` clause and would hide a dropped `tenant_id`
 * filter. This test runs against a real PostgreSQL database.
 *
 * Setup:
 *   - Tenant A (branch A, property A) with a non-terminal (SCHEDULED)
 *     appointment on branch A / property A → "open".
 *   - Tenant B (branch B, property B) whose only appointment is DONE
 *     (from the shared seed helper) → proves DONE does not count.
 *   - A terminal-only branch/property under Tenant A whose only appointment
 *     is CANCELLED → proves CANCELLED does not count.
 *
 * The pivotal assertions are `hasOpenAppointmentsForBranch(B, branchA)` and
 * `hasOpenAppointmentsForProperty(B, propertyA)` returning false: branch A /
 * property A DO carry an open appointment, but under tenant A — querying them
 * under tenant B must find nothing. These are the lines that fail the instant
 * the `tenant_id` filter is dropped again.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  setupDbHarness,
  teardownDbHarness,
  seedLegacyDoneAppointment,
  type DbHarness,
  type SeededAppointmentFixture,
} from './harness';
import { PrismaAppointmentChecker } from '../../../src/modules/tenant/infrastructure/prisma-appointment-checker';

async function createAppointment(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    branchId: string;
    propertyId: string;
    serviceTypeId: string;
    userId: string;
    status: 'SCHEDULED' | 'CANCELLED' | 'DONE';
  },
): Promise<string> {
  const appointment = await prisma.appointment.create({
    data: {
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      property_id: input.propertyId,
      service_type_id: input.serviceTypeId,
      status: input.status,
      scheduled_date: new Date('2026-06-15'),
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: input.userId,
    },
  });
  return appointment.id;
}

describe('PrismaAppointmentChecker: tenant scoping (real DB)', () => {
  let harness: DbHarness | undefined;
  let fixtureA: SeededAppointmentFixture | undefined;
  let fixtureB: SeededAppointmentFixture | undefined;
  // A branch/property under tenant A whose only appointment is terminal.
  let terminalBranchId: string | undefined;
  let terminalPropertyId: string | undefined;

  beforeAll(async () => {
    harness = await setupDbHarness();
    // Tenant A + Tenant B, each seeded with one DONE appointment.
    fixtureA = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'Checker-Scope Tenant A' });
    fixtureB = await seedLegacyDoneAppointment(harness.prisma, { tenantName: 'Checker-Scope Tenant B' });

    // Add a non-terminal (SCHEDULED) appointment under tenant A on branch A / property A.
    await createAppointment(harness.prisma, {
      tenantId: fixtureA.tenantId,
      branchId: fixtureA.branchId,
      propertyId: fixtureA.propertyId,
      serviceTypeId: fixtureA.serviceTypeId,
      userId: fixtureA.userId,
      status: 'SCHEDULED',
    });

    // Add a terminal-only (CANCELLED) branch + property under tenant A.
    const terminalBranch = await harness.prisma.branch.create({
      data: { tenant_id: fixtureA.tenantId, name: 'Terminal-only Branch', status: 'ACTIVE' },
    });
    const terminalProperty = await harness.prisma.property.create({
      data: {
        tenant_id: fixtureA.tenantId,
        branch_id: terminalBranch.id,
        property_code: `TERM-${Math.random().toString(36).slice(2, 10)}`,
        type: 'HOUSE',
        street: '2 Terminal St',
        suburb: 'Test',
        postcode: '2000',
        state: 'NSW',
        country: 'AU',
        geocoding_status: 'SUCCESS',
      },
    });
    terminalBranchId = terminalBranch.id;
    terminalPropertyId = terminalProperty.id;
    await createAppointment(harness.prisma, {
      tenantId: fixtureA.tenantId,
      branchId: terminalBranch.id,
      propertyId: terminalProperty.id,
      serviceTypeId: fixtureA.serviceTypeId,
      userId: fixtureA.userId,
      status: 'CANCELLED',
    });
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function checker(): PrismaAppointmentChecker {
    if (!harness) throw new Error('harness not initialized');
    return new PrismaAppointmentChecker(harness.prisma);
  }

  it('hasOpenAppointmentsForTenant: true for A (has a SCHEDULED), false for B (only DONE)', async () => {
    if (!fixtureA || !fixtureB) throw new Error('fixtures not initialized');
    expect(await checker().hasOpenAppointmentsForTenant(fixtureA.tenantId)).toBe(true);
    // Tenant B's only appointment is DONE → proves DONE does not count.
    expect(await checker().hasOpenAppointmentsForTenant(fixtureB.tenantId)).toBe(false);
  });

  it('hasOpenAppointmentsForBranch: true for (A, branchA), false for (B, branchA)', async () => {
    if (!fixtureA || !fixtureB) throw new Error('fixtures not initialized');
    expect(await checker().hasOpenAppointmentsForBranch(fixtureA.tenantId, fixtureA.branchId)).toBe(true);
    // branchA carries an open appointment, but under tenant A — querying under
    // tenant B must find nothing. Fails the instant tenant_id is dropped.
    expect(await checker().hasOpenAppointmentsForBranch(fixtureB.tenantId, fixtureA.branchId)).toBe(false);
  });

  it('hasOpenAppointmentsForProperty: true for (A, propertyA), false for (B, propertyA)', async () => {
    if (!fixtureA || !fixtureB) throw new Error('fixtures not initialized');
    expect(await checker().hasOpenAppointmentsForProperty(fixtureA.tenantId, fixtureA.propertyId)).toBe(true);
    expect(await checker().hasOpenAppointmentsForProperty(fixtureB.tenantId, fixtureA.propertyId)).toBe(false);
  });

  it('a CANCELLED-only branch/property does not count as open', async () => {
    if (!fixtureA || !terminalBranchId || !terminalPropertyId) throw new Error('fixtures not initialized');
    expect(await checker().hasOpenAppointmentsForBranch(fixtureA.tenantId, terminalBranchId)).toBe(false);
    expect(await checker().hasOpenAppointmentsForProperty(fixtureA.tenantId, terminalPropertyId)).toBe(false);
  });
});
