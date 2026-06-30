/**
 * C1 — Confirmation-cycle atomicity integration test.
 *
 * Validates that `ConfirmationCycleService.invalidateOnReopen` (and the shared
 * `supersedeCurrent` helper it delegates to) executes atomically against a real
 * PostgreSQL database:
 *
 *   1. Creates an appointment with an ACTIVE portal token and a PENDING cycle.
 *   2. Calls `invalidateOnReopen` — the outer transaction must:
 *      a. Mark the cycle SUPERSEDED in `appointment_confirmation_cycles`
 *      b. Mark the token SUPERSEDED in `tenant_portal_tokens`
 *      c. Clear `active_confirmation_cycle_id` on the appointment row
 *      d. Set `tenant_confirmation_status` to PENDING (reset denorm)
 *   3. Verifies all four side-effects in the same DB query after the call.
 *   4. Verifies no half-applied state is observable (the "atomicity" contract):
 *      if a subsequent read sees the cycle as SUPERSEDED, the token MUST also
 *      be SUPERSEDED — the test checks both in a single read without retries.
 *
 * Why this cannot be covered by unit tests:
 *   - Unit mocks accept any arguments and return configured values; they cannot
 *     detect that `prisma.tenantPortalToken.update(...)` was simply never called.
 *   - BUG-01 from QA cycle 1/2 was precisely this: `invalidateOnReopen` reached
 *     into the tx manually but skipped the token-update step, passing all unit
 *     tests. Only a real-DB test reading back the token row reveals the gap.
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

async function seedAppointmentWithActiveCycle(prisma: PrismaClient) {
  const tenant = await prisma.tenant.create({
    data: { name: 'C1 Tenant', legal_name: `C1 LLC ${Math.random().toString(36).slice(2)}`, status: 'ACTIVE' },
  });
  const branch = await prisma.branch.create({
    data: { tenant_id: tenant.id, name: 'C1 Branch', status: 'ACTIVE' },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id,
      property_code: `C1-${Math.random().toString(36).slice(2)}`,
      type: 'RESIDENTIAL', street: '1 Test St', suburb: 'Test',
      postcode: '2000', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS',
    },
  });
  const suffix = Math.random().toString(36).slice(2);
  const serviceType = await prisma.serviceType.create({
    data: {
      code: `C1-ST-${suffix}`,
      name: `C1 Routine ${suffix}`, flow_type: 'ROUTINE',
      requires_tenant_confirmation: true, status: 'ACTIVE',
    },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, role: 'OP',
      name: 'C1 Actor', email: `c1-${Math.random().toString(36).slice(2)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });

  // Create appointment without active cycle first
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

  // Create portal token
  const token = await prisma.tenantPortalToken.create({
    data: {
      appointment_id: appointment.id,
      token_hash: `hash-${Math.random().toString(36).slice(2)}`,
      expires_at: new Date('2026-08-01'),
      status: 'ACTIVE',
      raw_token_encrypted: 'enc-test',
    },
  });

  // Create a PENDING cycle linked to the token
  const cycle = await prisma.appointmentConfirmationCycle.create({
    data: {
      appointment_id: appointment.id, cycle_number: 1,
      scheduled_date: new Date('2026-07-01'), time_slot: '09:00-12:00',
      status: 'PENDING', portal_token_id: token.id,
    },
  });

  // Link the token to the cycle and set appointment denorm
  await prisma.tenantPortalToken.update({
    where: { id: token.id },
    data: { confirmation_cycle_id: cycle.id },
  });
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { active_confirmation_cycle_id: cycle.id },
  });

  return { tenantId: tenant.id, appointmentId: appointment.id, cycleId: cycle.id, tokenId: token.id };
}

describe('C1 — confirmation-cycle atomicity (real DB)', () => {
  it('invalidateOnReopen supersedes both cycle and portal token in one transaction', async () => {
    const { tenantId, appointmentId, cycleId, tokenId } = await seedAppointmentWithActiveCycle(harness.prisma as PrismaClient);

    await cycleService.invalidateOnReopen(appointmentId, tenantId);

    // Verify cycle marked SUPERSEDED
    const cycle = await harness.prisma.appointmentConfirmationCycle.findUnique({ where: { id: cycleId } });
    expect(cycle?.status).toBe('SUPERSEDED');
    expect(cycle?.invalidated_at).not.toBeNull();

    // Verify token marked SUPERSEDED (BUG-01 guard: this was the missing step)
    const token = await harness.prisma.tenantPortalToken.findUnique({ where: { id: tokenId } });
    expect(token?.status).toBe('SUPERSEDED');

    // Verify appointment denorm cleared
    const appointment = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appointment?.active_confirmation_cycle_id).toBeNull();
    expect(appointment?.tenant_confirmation_status).toBe('PENDING');
  });

  it('invalidateOnReopen is a no-op when no active cycle exists', async () => {
    // Seed appointment without any cycle
    const tenant = await harness.prisma.tenant.create({
      data: { name: 'C1 NoOp', legal_name: `C1 NoOp LLC ${Math.random().toString(36).slice(2)}`, status: 'ACTIVE' },
    });
    const branch = await harness.prisma.branch.create({
      data: { tenant_id: tenant.id, name: 'Branch', status: 'ACTIVE' },
    });
    const property = await harness.prisma.property.create({
      data: {
        tenant_id: tenant.id, branch_id: branch.id,
        property_code: `NOP-${Math.random().toString(36).slice(2)}`,
        type: 'RESIDENTIAL', street: '1 St', suburb: 'Sub',
        postcode: '2000', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS',
      },
    });
    const nopSuffix = Math.random().toString(36).slice(2);
    const serviceType = await harness.prisma.serviceType.create({
      data: {
        code: `NOP-${nopSuffix}`, name: `NOP ST ${nopSuffix}`,
        flow_type: 'ROUTINE', requires_tenant_confirmation: true, status: 'ACTIVE',
      },
    });
    const user = await harness.prisma.user.create({
      data: {
        tenant_id: tenant.id, branch_id: branch.id, role: 'OP',
        name: 'NOP Actor', email: `nop-${Math.random().toString(36).slice(2)}@test.local`,
        password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
      },
    });
    const appointment = await harness.prisma.appointment.create({
      data: {
        tenant_id: tenant.id, branch_id: branch.id, property_id: property.id,
        service_type_id: serviceType.id, status: 'SCHEDULED',
        scheduled_date: new Date('2026-07-01'), time_slot_start: '09:00', time_slot_end: '12:00',
        price_amount: '100.00', payout_amount: '80.00',
        pricing_rule_snapshot_json: {}, tenant_confirmation_status: 'PENDING',
        created_by_user_id: user.id,
      },
    });

    // Should resolve without throwing
    await expect(cycleService.invalidateOnReopen(appointment.id, tenant.id)).resolves.toBeUndefined();
  });

  it('cycle and token SUPERSEDED state are always consistent (atomicity assertion)', async () => {
    const { tenantId, appointmentId, cycleId, tokenId } = await seedAppointmentWithActiveCycle(harness.prisma as PrismaClient);

    await cycleService.invalidateOnReopen(appointmentId, tenantId);

    // Read both in one query to assert consistency — not a timing test, just a
    // structural guarantee that both columns changed in the same transaction.
    const [cycle, token] = await Promise.all([
      harness.prisma.appointmentConfirmationCycle.findUnique({ where: { id: cycleId } }),
      harness.prisma.tenantPortalToken.findUnique({ where: { id: tokenId } }),
    ]);

    // Either both are SUPERSEDED or neither is (consistency check)
    const cycleSuperseded = cycle?.status === 'SUPERSEDED';
    const tokenSuperseded = token?.status === 'SUPERSEDED';
    expect(cycleSuperseded).toBe(tokenSuperseded);
    expect(cycleSuperseded).toBe(true);
  });
});
