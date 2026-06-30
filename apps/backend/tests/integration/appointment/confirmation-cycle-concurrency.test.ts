/**
 * C2 — Concurrent createInitial race condition integration test.
 *
 * Validates the P2002 retry-once path in `ConfirmationCycleService.createInitial`.
 *
 * Background:
 *   The `appointment_confirmation_cycles` table has a partial unique index on
 *   `(appointment_id, cycle_number)`. When two concurrent requests both reach
 *   the "no active cycle" branch and both try to INSERT cycle_number=1, one
 *   succeeds (winner) and the other gets a P2002 unique-constraint error.
 *
 *   The service handles this by catching P2002 and retrying with a
 *   "link-to-existing" strategy: find the row the winner just inserted and
 *   update its portal_token_id to point to the loser's token instead.
 *
 * What this test does:
 *   1. Seeds an appointment with no active cycle.
 *   2. Creates two portal tokens (token-A and token-B).
 *   3. Fires two concurrent `createInitial` calls (Promise.all).
 *   4. Verifies exactly ONE cycle row was created.
 *   5. Verifies the cycle's portal_token_id points to one of the two tokens.
 *   6. Verifies the appointment denorm points to the created cycle.
 *
 * Note: because both calls run in the same process against the same DB, the
 * outcome is deterministic under Node.js's single-threaded event loop — the
 * second `await save(cycle, client)` in the loser's run() will collide with
 * the winner's committed row and trigger P2002. The retry path then links
 * the loser's token to the winner's cycle.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from '../db/harness';
import { PrismaConfirmationCycleRepository } from '../../../src/modules/appointment/infrastructure/prisma-confirmation-cycle.repository';
import { PrismaClient } from '@prisma/client';
import { ConfirmationCycleService } from '../../../src/modules/appointment/application/services/confirmation-cycle.service';

let harness: DbHarness;
let cycleRepo: PrismaConfirmationCycleRepository;
let cycleService: ConfirmationCycleService;

const auditMock = { log: vi.fn() };

beforeAll(async () => {
  harness = await setupDbHarness();
  cycleRepo = new PrismaConfirmationCycleRepository(harness.prisma);
  cycleService = new ConfirmationCycleService(cycleRepo, auditMock as any, harness.prisma as PrismaClient);
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

async function seedAppointmentNoActiveCycle(prisma: PrismaClient) {
  const tenant = await prisma.tenant.create({
    data: { name: 'C2 Tenant', legal_name: `C2 LLC ${Math.random().toString(36).slice(2)}`, status: 'ACTIVE' },
  });
  const branch = await prisma.branch.create({
    data: { tenant_id: tenant.id, name: 'C2 Branch', status: 'ACTIVE' },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id,
      property_code: `C2-${Math.random().toString(36).slice(2)}`,
      type: 'RESIDENTIAL', street: '1 Test St', suburb: 'Test',
      postcode: '2000', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS',
    },
  });
  const stSuffix = Math.random().toString(36).slice(2);
  const serviceType = await prisma.serviceType.create({
    data: {
      code: `C2-ST-${stSuffix}`,
      name: `C2 Routine ${stSuffix}`, flow_type: 'ROUTINE',
      requires_tenant_confirmation: true, status: 'ACTIVE',
    },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, role: 'OP',
      name: 'C2 Actor', email: `c2-${Math.random().toString(36).slice(2)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  const appointment = await prisma.appointment.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, property_id: property.id,
      service_type_id: serviceType.id, status: 'SCHEDULED',
      scheduled_date: new Date('2026-07-01'), time_slot_start: '09:00', time_slot_end: '12:00',
      price_amount: '100.00', payout_amount: '80.00',
      pricing_rule_snapshot_json: {}, tenant_confirmation_status: 'PENDING',
      created_by_user_id: user.id,
    },
  });

  // Create two tokens for the two concurrent callers
  const tokenA = await prisma.tenantPortalToken.create({
    data: {
      appointment_id: appointment.id,
      token_hash: `hash-A-${Math.random().toString(36).slice(2)}`,
      expires_at: new Date('2026-08-01'),
      status: 'ACTIVE',
      raw_token_encrypted: 'enc-A',
    },
  });
  const tokenB = await prisma.tenantPortalToken.create({
    data: {
      appointment_id: appointment.id,
      token_hash: `hash-B-${Math.random().toString(36).slice(2)}`,
      expires_at: new Date('2026-08-01'),
      status: 'ACTIVE',
      raw_token_encrypted: 'enc-B',
    },
  });

  return { tenantId: tenant.id, appointmentId: appointment.id, tokenAId: tokenA.id, tokenBId: tokenB.id };
}

describe('C2 — concurrent createInitial race (real DB)', () => {
  it('two parallel createInitial calls produce exactly one cycle row (loser links to winner)', async () => {
    const { tenantId, appointmentId, tokenAId, tokenBId } = await seedAppointmentNoActiveCycle(harness.prisma as PrismaClient);

    const scheduledDate = new Date('2026-07-01');
    const timeSlot = 'MORNING';

    // Fire both calls concurrently — one will win the INSERT, the other hits P2002 and retries
    const [resultA, resultB] = await Promise.all([
      cycleService.createInitial(appointmentId, tenantId, scheduledDate, timeSlot, tokenAId),
      cycleService.createInitial(appointmentId, tenantId, scheduledDate, timeSlot, tokenBId),
    ]);

    // Both should resolve to a cycle (no unhandled error)
    expect(resultA.appointmentId).toBe(appointmentId);
    expect(resultB.appointmentId).toBe(appointmentId);

    // Exactly ONE cycle row must exist for this appointment
    const cycles = await harness.prisma.appointmentConfirmationCycle.findMany({
      where: { appointment_id: appointmentId },
    });
    expect(cycles).toHaveLength(1);
    expect(cycles[0].status).toBe('PENDING');
    expect(cycles[0].cycle_number).toBe(1);

    // The cycle's portal_token_id is one of the two tokens (winner takes it)
    expect([tokenAId, tokenBId]).toContain(cycles[0].portal_token_id);

    // The appointment denorm points to the single cycle
    const appointment = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appointment?.active_confirmation_cycle_id).toBe(cycles[0].id);
  });
});
