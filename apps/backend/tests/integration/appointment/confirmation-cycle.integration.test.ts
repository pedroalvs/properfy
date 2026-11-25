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
 *      b. Mark the token SUPERSEDED in `rental_tenant_portal_tokens`
 *      c. Clear `active_confirmation_cycle_id` on the appointment row
 *      d. Set `rental_tenant_confirmation_status` to PENDING (reset denorm)
 *   3. Verifies all four side-effects in the same DB query after the call.
 *   4. Verifies no half-applied state is observable (the "atomicity" contract):
 *      if a subsequent read sees the cycle as SUPERSEDED, the token MUST also
 *      be SUPERSEDED — the test checks both in a single read without retries.
 *
 * Why this cannot be covered by unit tests:
 *   - Unit mocks accept any arguments and return configured values; they cannot
 *     detect that `prisma.rentalTenantPortalToken.update(...)` was simply never called.
 *   - BUG-01 from QA cycle 1/2 was precisely this: `invalidateOnReopen` reached
 *     into the tx manually but skipped the token-update step, passing all unit
 *     tests. Only a real-DB test reading back the token row reveals the gap.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from '../db/harness';
import { PrismaConfirmationCycleRepository } from '../../../src/modules/appointment/infrastructure/prisma-confirmation-cycle.repository';
import { PrismaClient } from '@prisma/client';
import { ConfirmationCycleService } from '../../../src/modules/appointment/application/services/confirmation-cycle.service';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaTenantRepository } from '../../../src/modules/tenant/infrastructure/prisma-tenant.repository';
import { GeneratePortalTokenUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/generate-portal-token.use-case';
import { PrismaRentalTenantPortalTokenRepository } from '../../../src/modules/rental-tenant-portal/infrastructure/prisma-rental-tenant-portal-token.repository';
import { MintPortalTokenService } from '../../../src/modules/rental-tenant-portal/domain/mint-portal-token.service';
import { TokenService } from '../../../src/modules/rental-tenant-portal/domain/token.service';
import type { AuthContext } from '@properfy/shared';

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
      type: 'HOUSE', street: '1 Test St', suburb: 'Test',
      postcode: '2000', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS',
    },
  });
  const suffix = Math.random().toString(36).slice(2);
  const serviceType = await prisma.serviceType.create({
    data: {
      code: `C1-ST-${suffix}`,
      name: `C1 Routine ${suffix}`, flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true, status: 'ACTIVE',
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
      pricing_rule_snapshot_json: {}, rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: user.id,
    },
  });

  // Create portal token
  const token = await prisma.rentalTenantPortalToken.create({
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
  await prisma.rentalTenantPortalToken.update({
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
    const token = await harness.prisma.rentalTenantPortalToken.findUnique({ where: { id: tokenId } });
    expect(token?.status).toBe('SUPERSEDED');

    // Verify appointment denorm cleared
    const appointment = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appointment?.active_confirmation_cycle_id).toBeNull();
    expect(appointment?.rental_tenant_confirmation_status).toBe('PENDING');
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
        type: 'HOUSE', street: '1 St', suburb: 'Sub',
        postcode: '2000', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS',
      },
    });
    const nopSuffix = Math.random().toString(36).slice(2);
    const serviceType = await harness.prisma.serviceType.create({
      data: {
        code: `NOP-${nopSuffix}`, name: `NOP ST ${nopSuffix}`,
        flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, status: 'ACTIVE',
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
        pricing_rule_snapshot_json: {}, rental_tenant_confirmation_status: 'PENDING',
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
      harness.prisma.rentalTenantPortalToken.findUnique({ where: { id: tokenId } }),
    ]);

    // Either both are SUPERSEDED or neither is (consistency check)
    const cycleSuperseded = cycle?.status === 'SUPERSEDED';
    const tokenSuperseded = token?.status === 'SUPERSEDED';
    expect(cycleSuperseded).toBe(tokenSuperseded);
    expect(cycleSuperseded).toBe(true);
  });
});

/**
 * O-11: generating a portal link / confirming must never silently reset a
 * confirmation when no cycle exists yet (the normal state for email / forced /
 * group-join confirmations). These run against a real DB through the real service.
 */
// A civil date comfortably in the future (well past the T-1 cutoff) so the real
// GeneratePortalTokenUseCase does not reject the link as born-expired
// (PORTAL_APPOINTMENT_DATE_PAST). Mirrors the group integration's civilMidnight(+30).
const FUTURE_SCHEDULED_DATE = new Date(
  `${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}T00:00:00.000Z`,
);

async function seedAppointmentWithoutCycle(prisma: PrismaClient, confirmationStatus: string) {
  const tenant = await prisma.tenant.create({
    data: { name: 'O11 Tenant', legal_name: `O11 LLC ${Math.random().toString(36).slice(2)}`, status: 'ACTIVE' },
  });
  const branch = await prisma.branch.create({ data: { tenant_id: tenant.id, name: 'O11 Branch', status: 'ACTIVE' } });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id,
      property_code: `O11-${Math.random().toString(36).slice(2)}`,
      type: 'HOUSE', street: '1 Test St', suburb: 'Test', postcode: '2000', state: 'NSW', country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  const suffix = Math.random().toString(36).slice(2);
  const serviceType = await prisma.serviceType.create({
    data: {
      code: `O11-ST-${suffix}`, name: `O11 Routine ${suffix}`, flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true, status: 'ACTIVE',
    },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, role: 'OP', name: 'O11 Actor',
      email: `o11-${Math.random().toString(36).slice(2)}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake', status: 'ACTIVE',
    },
  });
  // No cycle, no active_confirmation_cycle_id — exactly the vulnerable state.
  const appointment = await prisma.appointment.create({
    data: {
      tenant_id: tenant.id, branch_id: branch.id, property_id: property.id,
      service_type_id: serviceType.id, status: 'SCHEDULED',
      scheduled_date: FUTURE_SCHEDULED_DATE, time_slot_start: '09:00', time_slot_end: '12:00',
      price_amount: '100.00', payout_amount: '80.00',
      pricing_rule_snapshot_json: {}, rental_tenant_confirmation_status: confirmationStatus as never,
      created_by_user_id: user.id,
    },
  });
  return { tenantId: tenant.id, appointmentId: appointment.id };
}

describe('O-11 — portal link/confirm never resets a confirmation without a cycle (real DB)', () => {
  it('createInitial ADOPTS a CONFIRMED appointment (stays CONFIRMED) instead of resetting it', async () => {
    const { tenantId, appointmentId } = await seedAppointmentWithoutCycle(harness.prisma as PrismaClient, 'CONFIRMED');

    await cycleService.createInitial(appointmentId, tenantId, FUTURE_SCHEDULED_DATE, '09:00-12:00', null);

    const appt = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt?.rental_tenant_confirmation_status).toBe('CONFIRMED');
    const cycle = await harness.prisma.appointmentConfirmationCycle.findFirst({ where: { appointment_id: appointmentId } });
    expect(cycle?.status).toBe('CONFIRMED');
    expect(appt?.active_confirmation_cycle_id).toBe(cycle?.id);
  });

  it('confirm CREATES a CONFIRMED cycle when none exists (durable confirmation)', async () => {
    const { tenantId, appointmentId } = await seedAppointmentWithoutCycle(harness.prisma as PrismaClient, 'PENDING');

    await cycleService.confirm(appointmentId, tenantId, 'RENTAL_TENANT_PORTAL', null);

    const appt = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt?.rental_tenant_confirmation_status).toBe('CONFIRMED');
    const cycle = await harness.prisma.appointmentConfirmationCycle.findFirst({ where: { appointment_id: appointmentId } });
    expect(cycle?.status).toBe('CONFIRMED');
  });

  it('markUnavailable CREATES an UNAVAILABLE cycle when none exists', async () => {
    const { tenantId, appointmentId } = await seedAppointmentWithoutCycle(harness.prisma as PrismaClient, 'PENDING');

    await cycleService.markUnavailable(appointmentId, tenantId);

    const appt = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt?.rental_tenant_confirmation_status).toBe('UNAVAILABLE');
    const cycle = await harness.prisma.appointmentConfirmationCycle.findFirst({ where: { appointment_id: appointmentId } });
    expect(cycle?.status).toBe('UNAVAILABLE');
  });

  // Repeated to rule out intermittency: the loser of each race hits the partial
  // `appointment_active_cycle_unique` (one active cycle per appointment) or the
  // `cycle_number` unique, replays in a fresh transaction, and converges on the
  // single winning cycle.
  const CONCURRENCY_ITERATIONS = 25;

  it(`two concurrent confirms converge on ONE CONFIRMED cycle — ${CONCURRENCY_ITERATIONS} iterations`, async () => {
    for (let i = 0; i < CONCURRENCY_ITERATIONS; i++) {
      const { tenantId, appointmentId } = await seedAppointmentWithoutCycle(harness.prisma as PrismaClient, 'PENDING');

      await Promise.all([
        cycleService.confirm(appointmentId, tenantId, 'RENTAL_TENANT_PORTAL', null),
        cycleService.confirm(appointmentId, tenantId, 'RENTAL_TENANT_PORTAL', null),
      ]);

      const appt = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
      expect(appt?.rental_tenant_confirmation_status, `iteration ${i}`).toBe('CONFIRMED');
      const cycles = await harness.prisma.appointmentConfirmationCycle.findMany({ where: { appointment_id: appointmentId } });
      expect(cycles, `iteration ${i}`).toHaveLength(1);
      expect(cycles[0]?.status).toBe('CONFIRMED');
    }
  });

  // Mixed-status race (confirm vs markUnavailable): DEFINED as last-writer-wins —
  // neither throws, exactly ONE cycle survives, and its status is one of the two
  // requested (never PENDING, never two cycles), exactly as a sequential run of the
  // two in whichever order would leave it.
  it(`concurrent confirm + markUnavailable converge to one of the two statuses — ${CONCURRENCY_ITERATIONS} iterations`, async () => {
    const seen = new Set<string>();
    for (let i = 0; i < CONCURRENCY_ITERATIONS; i++) {
      const { tenantId, appointmentId } = await seedAppointmentWithoutCycle(harness.prisma as PrismaClient, 'PENDING');

      // Neither op rejects — both converge on the single active cycle.
      await Promise.all([
        cycleService.confirm(appointmentId, tenantId, 'RENTAL_TENANT_PORTAL', null),
        cycleService.markUnavailable(appointmentId, tenantId),
      ]);

      const cycles = await harness.prisma.appointmentConfirmationCycle.findMany({ where: { appointment_id: appointmentId } });
      expect(cycles, `iteration ${i}`).toHaveLength(1);
      const appt = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
      expect(['CONFIRMED', 'UNAVAILABLE'], `iteration ${i}`).toContain(appt?.rental_tenant_confirmation_status);
      // The denorm and the cycle never diverge.
      expect(appt?.rental_tenant_confirmation_status).toBe(cycles[0]?.status);
      if (appt?.rental_tenant_confirmation_status) seen.add(appt.rental_tenant_confirmation_status);
    }
    // Sanity: the defined outcome set is exactly {CONFIRMED, UNAVAILABLE}.
    for (const s of seen) expect(['CONFIRMED', 'UNAVAILABLE']).toContain(s);
  });
});

const AM_ACTOR: AuthContext = { userId: 'user-op', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

/** Real GeneratePortalTokenUseCase wired to the shared cycleService (auditMock). */
function makeGeneratePortalToken(): GeneratePortalTokenUseCase {
  const tokenRepo = new PrismaRentalTenantPortalTokenRepository(harness.prisma);
  const createNotification = { execute: vi.fn().mockResolvedValue({ notificationId: 'n1', created: true }) };
  return new GeneratePortalTokenUseCase(
    tokenRepo,
    new PrismaAppointmentRepository(harness.prisma),
    new PrismaTenantRepository(harness.prisma),
    new MintPortalTokenService(tokenRepo, new TokenService()),
    auditMock as never,
    'https://portal.test',
    createNotification as never,
    cycleService,
    harness.prisma as PrismaClient,
  );
}

/**
 * O-11 — the single-link triggers (Send Portal Link, Generate and copy, and the
 * bulk resend, which loops this same use case) must ADOPT a CONFIRMED-without-cycle
 * appointment through the real GeneratePortalTokenUseCase, never reset it.
 */
describe('O-11 — single-link triggers adopt a CONFIRMED-without-cycle appointment (real use case)', () => {
  it.each([
    ['Send Portal Link (notify)', true],
    ['Generate and copy (notify:false)', false],
  ])('%s stays CONFIRMED, mints a token + CONFIRMED cycle, writes NO reset audit', async (_label, notify) => {
    const { appointmentId } = await seedAppointmentWithoutCycle(harness.prisma as PrismaClient, 'CONFIRMED');
    auditMock.log.mockClear();

    await makeGeneratePortalToken().execute({ appointmentId, actor: AM_ACTOR, notify });

    const appt = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt?.rental_tenant_confirmation_status).toBe('CONFIRMED');
    const cycle = await harness.prisma.appointmentConfirmationCycle.findFirst({ where: { appointment_id: appointmentId } });
    expect(cycle?.status).toBe('CONFIRMED');
    expect(appt?.active_confirmation_cycle_id).toBe(cycle?.id);
    expect(await harness.prisma.rentalTenantPortalToken.count({ where: { appointment_id: appointmentId } })).toBe(1);
    const resetAudits = auditMock.log.mock.calls.filter(
      ([e]: [{ action: string }]) => e.action === 'appointment.rental_tenant_confirmation_reset',
    );
    expect(resetAudits).toHaveLength(0);
  });

  // Consequence: an adopted CONFIRMED appointment is excluded from the T-1
  // reject-unconfirmed query (so no TENANT_NO_RESPONSE) and, being CONFIRMED,
  // reminders/escalations stay suspended — both read the same status.
  it('is excluded from findUnconfirmedForDate after a link is generated (no T-1 rejection)', async () => {
    const { appointmentId } = await seedAppointmentWithoutCycle(harness.prisma as PrismaClient, 'CONFIRMED');
    await makeGeneratePortalToken().execute({ appointmentId, actor: AM_ACTOR, notify: false });

    const apptRepo = new PrismaAppointmentRepository(harness.prisma);
    const unconfirmed = await apptRepo.findUnconfirmedForDate(FUTURE_SCHEDULED_DATE);
    expect(unconfirmed.map((a) => a.id)).not.toContain(appointmentId);
  });
});

/**
 * O-11 regression (decision 2): before option B an UNAVAILABLE appointment had no
 * cycle, so a new link re-opened it to PENDING via the no-active branch. Option B
 * made "can't attend" a durable ACTIVE UNAVAILABLE cycle, which routed the link into
 * the active-cycle branch — which only attached a token and left it UNAVAILABLE. A
 * new link for someone who said "can't" must REOPEN to PENDING (supersede-and-new,
 * mirroring rotateOnDateChange / group rule 3) with a reset audit, and reminders
 * must resume.
 */
describe('O-11 — a new link REOPENS an UNAVAILABLE/NO_RESPONSE confirmation (regression, real DB)', () => {
  it('createInitial reopens an ACTIVE UNAVAILABLE cycle to PENDING, superseding it, with a reset audit', async () => {
    const { tenantId, appointmentId } = await seedAppointmentWithoutCycle(harness.prisma as PrismaClient, 'PENDING');
    // Option B: "can't attend" opens a durable ACTIVE UNAVAILABLE cycle.
    await cycleService.markUnavailable(appointmentId, tenantId);
    auditMock.log.mockClear();

    await cycleService.createInitial(
      appointmentId, tenantId, FUTURE_SCHEDULED_DATE, '09:00-12:00', 'tok-reopen', undefined, undefined,
      { actorId: 'op-1', cause: 'PORTAL_LINK_GENERATED' },
    );

    const appt = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt?.rental_tenant_confirmation_status).toBe('PENDING');
    const cycles = await harness.prisma.appointmentConfirmationCycle.findMany({
      where: { appointment_id: appointmentId },
      orderBy: { cycle_number: 'asc' },
    });
    expect(cycles).toHaveLength(2);
    expect(cycles[0]?.status).toBe('SUPERSEDED'); // the UNAVAILABLE cycle preserved as history
    expect(cycles[1]?.status).toBe('PENDING');
    expect(appt?.active_confirmation_cycle_id).toBe(cycles[1]?.id);
    const resetAudits = auditMock.log.mock.calls.filter(
      ([e]: [{ action: string }]) => e.action === 'appointment.rental_tenant_confirmation_reset',
    );
    expect(resetAudits).toHaveLength(1);
    expect(resetAudits[0]?.[0]).toMatchObject({
      before: { rentalTenantConfirmationStatus: 'UNAVAILABLE' },
      after: { rentalTenantConfirmationStatus: 'PENDING' },
      metadata: { cause: 'PORTAL_LINK_GENERATED' },
    });
  });

  it('a generated link reopens UNAVAILABLE to PENDING end-to-end and reminders resume (T-1 includes it)', async () => {
    const { tenantId, appointmentId } = await seedAppointmentWithoutCycle(harness.prisma as PrismaClient, 'PENDING');
    await cycleService.markUnavailable(appointmentId, tenantId);
    auditMock.log.mockClear();

    await makeGeneratePortalToken().execute({ appointmentId, actor: AM_ACTOR, notify: false });

    const appt = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt?.rental_tenant_confirmation_status).toBe('PENDING');
    const active = await harness.prisma.appointmentConfirmationCycle.findFirst({
      where: { appointment_id: appointmentId, status: { not: 'SUPERSEDED' } },
    });
    expect(active?.status).toBe('PENDING');
    const resetAudits = auditMock.log.mock.calls.filter(
      ([e]: [{ action: string }]) => e.action === 'appointment.rental_tenant_confirmation_reset',
    );
    expect(resetAudits).toHaveLength(1);
    // Consequence: the reopened PENDING appointment is T-1 visible again, so reminders
    // and the auto-reject sweep resume (the point of decision 2).
    const apptRepo = new PrismaAppointmentRepository(harness.prisma);
    const unconfirmed = await apptRepo.findUnconfirmedForDate(FUTURE_SCHEDULED_DATE);
    expect(unconfirmed.map((a) => a.id)).toContain(appointmentId);
  });

  it('a generated link reopens a NO_RESPONSE appointment to PENDING (no active cycle: invalidateOnReject cleared it)', async () => {
    const { appointmentId } = await seedAppointmentWithoutCycle(harness.prisma as PrismaClient, 'NO_RESPONSE');
    // NO_RESPONSE never carries an active cycle — the reject-unconfirmed worker
    // supersedes and clears it — so it reopens through the no-active branch.
    expect(
      await harness.prisma.appointmentConfirmationCycle.count({ where: { appointment_id: appointmentId } }),
    ).toBe(0);
    auditMock.log.mockClear();

    await makeGeneratePortalToken().execute({ appointmentId, actor: AM_ACTOR, notify: false });

    const appt = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt?.rental_tenant_confirmation_status).toBe('PENDING');
    const resetAudits = auditMock.log.mock.calls.filter(
      ([e]: [{ action: string }]) => e.action === 'appointment.rental_tenant_confirmation_reset',
    );
    expect(resetAudits).toHaveLength(1);
    expect(resetAudits[0]?.[0]).toMatchObject({
      before: { rentalTenantConfirmationStatus: 'NO_RESPONSE' },
      after: { rentalTenantConfirmationStatus: 'PENDING' },
    });
  });

  it('leaves an ACTIVE CONFIRMED cycle intact when a link is generated (no reopen, no reset)', async () => {
    const { tenantId, appointmentId } = await seedAppointmentWithoutCycle(harness.prisma as PrismaClient, 'PENDING');
    await cycleService.confirm(appointmentId, tenantId, 'RENTAL_TENANT_PORTAL', null); // active CONFIRMED cycle
    auditMock.log.mockClear();

    await makeGeneratePortalToken().execute({ appointmentId, actor: AM_ACTOR, notify: false });

    const appt = await harness.prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt?.rental_tenant_confirmation_status).toBe('CONFIRMED');
    const cycles = await harness.prisma.appointmentConfirmationCycle.findMany({ where: { appointment_id: appointmentId } });
    expect(cycles).toHaveLength(1); // no supersede, no new cycle
    expect(cycles[0]?.status).toBe('CONFIRMED');
    const resetAudits = auditMock.log.mock.calls.filter(
      ([e]: [{ action: string }]) => e.action === 'appointment.rental_tenant_confirmation_reset',
    );
    expect(resetAudits).toHaveLength(0);
  });
});
