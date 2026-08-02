/**
 * Real-database tests for the group "Send portal link" flow.
 *
 * Covers the two things the mocked unit/route tests cannot:
 *  1. `findGroupAppointmentsWithConfirmation` returns ALL tenants' appointments
 *     of a (tenant-agnostic) group and correctly maps the active confirmation
 *     cycle's date/slot/status — i.e. the query has no tenant WHERE filter and
 *     the join mapping is right.
 *  2. `SendGroupPortalLinksUseCase` enforces OP tenant isolation through the
 *     REAL repository: an OP only acts on their own tenant's appointments while
 *     AM is cross-tenant.
 *
 * Requires Docker (testcontainers). Run via: `pnpm --filter backend test:integration:db`
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { PrismaClient, Prisma } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { seedTenant } from '../service-region/helpers/service-region-fixtures';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { SendGroupPortalLinksUseCase } from '../../../src/modules/service-group/application/use-cases/send-group-portal-links.use-case';
import { PrismaConfirmationCycleRepository } from '../../../src/modules/appointment/infrastructure/prisma-confirmation-cycle.repository';
import { ConfirmationCycleService } from '../../../src/modules/appointment/application/services/confirmation-cycle.service';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaTenantRepository } from '../../../src/modules/tenant/infrastructure/prisma-tenant.repository';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { GeneratePortalTokenUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/generate-portal-token.use-case';
import { PrismaRentalTenantPortalTokenRepository } from '../../../src/modules/rental-tenant-portal/infrastructure/prisma-rental-tenant-portal-token.repository';
import { MintPortalTokenService } from '../../../src/modules/rental-tenant-portal/domain/mint-portal-token.service';
import { TokenService } from '../../../src/modules/rental-tenant-portal/domain/token.service';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import type { GroupAppointmentConfirmationRow } from '../../../src/modules/service-group/domain/service-group.repository';

let harness: DbHarness;
let repo: PrismaServiceGroupRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaServiceGroupRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE appointment_confirmation_cycles, appointments, service_groups, properties, service_types, users, branches, tenants CASCADE`,
  );
});

const SCHEDULED_DATE = new Date('2026-08-01T00:00:00.000Z');
const STALE_DATE = new Date('2026-08-08T00:00:00.000Z');
const SLOT = 'MORNING';

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
    data: { code: `ST-${suffix}`, name: `Routine ${suffix}`, flow_type: 'ROUTINE', requires_rental_tenant_confirmation: true, status: 'ACTIVE' },
  });
  return st.id;
}

async function seedProperty(prisma: PrismaClient, tenantId: string, branchId: string): Promise<string> {
  const p = await prisma.property.create({
    data: {
      tenant_id: tenantId, branch_id: branchId, property_code: `P-${rand()}`, type: 'HOUSE',
      street: '1 Test St', suburb: 'Sydney', postcode: '2000', state: 'NSW', country: 'AU', geocoding_status: 'SUCCESS',
    },
  });
  return p.id;
}

async function seedGroup(prisma: PrismaClient, serviceTypeId: string, createdByUserId: string): Promise<string> {
  const g = await prisma.serviceGroup.create({
    data: {
      service_type_id: serviceTypeId, status: 'PUBLISHED',
      scheduled_date: SCHEDULED_DATE, time_window: '08:00-12:00', published_at: new Date(), created_by_user_id: createdByUserId,
    },
  });
  return g.id;
}

async function seedAppointment(
  prisma: PrismaClient,
  params: {
    tenantId: string; branchId: string; propertyId: string; serviceTypeId: string; createdByUserId: string; groupId: string;
    status?: string; rentalTenantConfirmationStatus?: string; scheduledDate?: Date;
    /** When set, creates an active confirmation cycle for this date/slot and links it. */
    activeCycle?: { scheduledDate: Date; timeSlot: string | null; status: 'PENDING' | 'CONFIRMED' };
  },
): Promise<string> {
  const appt = await prisma.appointment.create({
    data: {
      tenant_id: params.tenantId, branch_id: params.branchId, property_id: params.propertyId,
      service_type_id: params.serviceTypeId, status: (params.status ?? 'AWAITING_INSPECTOR') as never,
      scheduled_date: params.scheduledDate ?? SCHEDULED_DATE, time_slot_start: '09:00', time_slot_end: '12:00',
      price_amount: '100.00', payout_amount: '80.00', pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: (params.rentalTenantConfirmationStatus ?? 'PENDING') as never,
      created_by_user_id: params.createdByUserId, service_group_id: params.groupId,
    },
  });
  if (params.activeCycle) {
    const cycle = await prisma.appointmentConfirmationCycle.create({
      data: {
        appointment_id: appt.id, cycle_number: 1, scheduled_date: params.activeCycle.scheduledDate,
        time_slot: params.activeCycle.timeSlot, status: params.activeCycle.status as never,
        confirmed_at: params.activeCycle.status === 'CONFIRMED' ? new Date() : null,
      },
    });
    await prisma.appointment.update({ where: { id: appt.id }, data: { active_confirmation_cycle_id: cycle.id } });
  }
  return appt.id;
}

async function seedPrimaryContact(prisma: PrismaClient, appointmentId: string): Promise<void> {
  await prisma.appointmentContact.create({
    data: {
      appointment_id: appointmentId,
      role: 'RENTAL_TENANT',
      is_primary: true,
      snapshot_name: 'Tenant Test',
      snapshot_email: `tenant-${rand()}@test.local`,
      snapshot_phone: null,
    },
  });
}

async function waitForBlockedQuery(
  prisma: PrismaClient,
  marker: string,
): Promise<{ state: string; wait_event_type: string | null; wait_event: string | null }> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ state: string; wait_event_type: string | null; wait_event: string | null }>
    >(
      `SELECT state, wait_event_type, wait_event
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND query LIKE $1`,
      `%${marker}%`,
    );
    const blocked = rows.find((row) => row.state === 'active' && row.wait_event_type === 'Lock');
    if (blocked) return blocked;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for PostgreSQL query ${marker} to block on the tenant row lock`);
}

function makeActor(overrides: Partial<AuthContext>): AuthContext {
  return { userId: 'u1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, ...overrides };
}

describe('group Send portal link — real DB', () => {
  it('loads a current portal-link member only within its group, tenant and live scope', async () => {
    const { tenantId: tenantA, userId: userA } = await seedTenant(harness.prisma, 'Agency scoped lookup A');
    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'Agency scoped lookup B');
    const branchA = await getBranchId(harness.prisma, tenantA);
    const branchB = await getBranchId(harness.prisma, tenantB);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const groupId = await seedGroup(harness.prisma, serviceTypeId, userA);
    const otherGroupId = await seedGroup(harness.prisma, serviceTypeId, userA);
    const propertyA = await seedProperty(harness.prisma, tenantA, branchA);
    const propertyB = await seedProperty(harness.prisma, tenantB, branchB);
    const appointmentId = await seedAppointment(harness.prisma, {
      tenantId: tenantA,
      branchId: branchA,
      propertyId: propertyA,
      serviceTypeId,
      createdByUserId: userA,
      groupId,
    });
    await seedAppointment(harness.prisma, {
      tenantId: tenantB,
      branchId: branchB,
      propertyId: propertyB,
      serviceTypeId,
      createdByUserId: userB,
      groupId,
    });
    await seedAppointment(harness.prisma, {
      tenantId: tenantA,
      branchId: branchA,
      propertyId: propertyA,
      serviceTypeId,
      createdByUserId: userA,
      groupId: otherGroupId,
    });
    const scopedRepo = repo as unknown as {
      findGroupAppointmentWithConfirmation(
        groupId: string,
        appointmentId: string,
        tenantId: string,
        tx?: Prisma.TransactionClient,
      ): Promise<GroupAppointmentConfirmationRow | null>;
    };

    await expect(harness.prisma.$transaction((tx) => (
      scopedRepo.findGroupAppointmentWithConfirmation(groupId, appointmentId, tenantA, tx)
    ))).resolves.toMatchObject({ id: appointmentId, tenantId: tenantA });
    await expect(
      scopedRepo.findGroupAppointmentWithConfirmation(otherGroupId, appointmentId, tenantA),
    ).resolves.toBeNull();
    await expect(
      scopedRepo.findGroupAppointmentWithConfirmation(groupId, appointmentId, tenantB),
    ).resolves.toBeNull();

    await harness.prisma.appointment.update({
      where: { id: appointmentId },
      data: { deleted_at: new Date() },
    });
    await expect(
      scopedRepo.findGroupAppointmentWithConfirmation(groupId, appointmentId, tenantA),
    ).resolves.toBeNull();
  });

  it('findGroupAppointmentsWithConfirmation returns all tenants and maps the active cycle', async () => {
    const { tenantId: tenantA, userId: userA } = await seedTenant(harness.prisma, 'Agency A');
    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'Agency B');
    const branchA = await getBranchId(harness.prisma, tenantA);
    const branchB = await getBranchId(harness.prisma, tenantB);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const groupId = await seedGroup(harness.prisma, serviceTypeId, userA);

    const propA = await seedProperty(harness.prisma, tenantA, branchA);
    const propB = await seedProperty(harness.prisma, tenantB, branchB);

    // Tenant A: CONFIRMED but the cycle is for a STALE date (date changed after confirmation).
    const apptA = await seedAppointment(harness.prisma, {
      tenantId: tenantA, branchId: branchA, propertyId: propA, serviceTypeId, createdByUserId: userA, groupId,
      rentalTenantConfirmationStatus: 'CONFIRMED', scheduledDate: STALE_DATE,
      activeCycle: { scheduledDate: SCHEDULED_DATE, timeSlot: SLOT, status: 'CONFIRMED' },
    });
    // Tenant B: plain pending, no cycle.
    const apptB = await seedAppointment(harness.prisma, {
      tenantId: tenantB, branchId: branchB, propertyId: propB, serviceTypeId, createdByUserId: userB, groupId,
    });

    const rows = await repo.findGroupAppointmentsWithConfirmation(groupId);
    const byId = new Map(rows.map((r) => [r.id, r]));

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.tenantId))).toEqual(new Set([tenantA, tenantB]));

    const a = byId.get(apptA)!;
    expect(a.rentalTenantConfirmationStatus).toBe('CONFIRMED');
    expect(a.scheduledDate.toISOString().slice(0, 10)).toBe('2026-08-08'); // current (stale) date
    expect(a.activeCycle).not.toBeNull();
    expect(a.activeCycle!.scheduledDate.toISOString().slice(0, 10)).toBe('2026-08-01'); // confirmed-for date
    expect(a.activeCycle!.timeSlot).toBe(SLOT);
    expect(a.activeCycle!.status).toBe('CONFIRMED');

    const b = byId.get(apptB)!;
    expect(b.rentalTenantConfirmationStatus).toBe('PENDING');
    expect(b.activeCycle).toBeNull();
  });

  it('SendGroupPortalLinksUseCase: OP acts only on its own tenant; AM is cross-tenant', async () => {
    const { tenantId: tenantA, userId: userA } = await seedTenant(harness.prisma, 'Agency A');
    const { tenantId: tenantB, userId: userB } = await seedTenant(harness.prisma, 'Agency B');
    const branchA = await getBranchId(harness.prisma, tenantA);
    const branchB = await getBranchId(harness.prisma, tenantB);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const groupId = await seedGroup(harness.prisma, serviceTypeId, userA);

    const apptA = await seedAppointment(harness.prisma, {
      tenantId: tenantA, branchId: branchA, propertyId: await seedProperty(harness.prisma, tenantA, branchA),
      serviceTypeId, createdByUserId: userA, groupId,
    });
    const apptB = await seedAppointment(harness.prisma, {
      tenantId: tenantB, branchId: branchB, propertyId: await seedProperty(harness.prisma, tenantB, branchB),
      serviceTypeId, createdByUserId: userB, groupId,
    });

    const generatePortalToken = { execute: vi.fn().mockResolvedValue({ dispatched: true }) } as unknown as GeneratePortalTokenUseCase;
    const cycleService = { rotateOnDateChange: vi.fn() } as unknown as ConfirmationCycleService;
    const idempotency = { getWithHash: vi.fn().mockResolvedValue(null), set: vi.fn() } as unknown as IIdempotencyService;
    const auditService = { log: vi.fn() } as unknown as AuditService;
    const useCase = new SendGroupPortalLinksUseCase(
      repo, generatePortalToken, cycleService, idempotency, auditService, new AuthorizationService(auditService),
    );

    // OP for tenant A → only A's appointment is dispatched.
    const opOut = await useCase.execute({ groupId, actor: makeActor({ role: 'OP', tenantId: tenantA }) });
    expect(opOut.results.map((r) => r.appointmentId)).toEqual([apptA]);
    expect(generatePortalToken.execute).toHaveBeenCalledTimes(1);
    expect(generatePortalToken.execute).toHaveBeenCalledWith({ appointmentId: apptA, actor: expect.objectContaining({ tenantId: tenantA }) });

    // AM → both appointments are dispatched.
    (generatePortalToken.execute as ReturnType<typeof vi.fn>).mockClear();
    const amOut = await useCase.execute({ groupId, actor: makeActor({ role: 'AM', tenantId: null }) });
    expect(new Set(amOut.results.map((r) => r.appointmentId))).toEqual(new Set([apptA, apptB]));
    expect(generatePortalToken.execute).toHaveBeenCalledTimes(2);
  });

  it('checks a newly blocked real policy before rotating an enabled SEND_AFTER_RESET snapshot', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency policy flip');
    await harness.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings_json: {
          rentalTenantNotificationsEnabled: true,
          emailSendingEnabled: true,
        },
      },
    });
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const groupId = await seedGroup(harness.prisma, serviceTypeId, userId);
    const appointmentId = await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId: await seedProperty(harness.prisma, tenantId, branchId),
      serviceTypeId,
      createdByUserId: userId,
      groupId,
      rentalTenantConfirmationStatus: 'CONFIRMED',
      scheduledDate: STALE_DATE,
      activeCycle: { scheduledDate: SCHEDULED_DATE, timeSlot: SLOT, status: 'CONFIRMED' },
    });
    const before = await harness.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: { active_confirmation_cycle_id: true },
    });
    const originalToken = await harness.prisma.rentalTenantPortalToken.create({
      data: {
        appointment_id: appointmentId,
        token_hash: `original-${rand()}`,
        expires_at: new Date('2026-08-09T23:59:59.000Z'),
        status: 'ACTIVE',
        confirmation_cycle_id: before.active_confirmation_cycle_id,
      },
    });
    await harness.prisma.appointmentConfirmationCycle.update({
      where: { id: before.active_confirmation_cycle_id! },
      data: { portal_token_id: originalToken.id },
    });

    const auditService = { log: vi.fn() } as unknown as AuditService;
    const cycleService = new ConfirmationCycleService(
      new PrismaConfirmationCycleRepository(harness.prisma),
      auditService,
      harness.prisma,
    );
    let rotationAttempts = 0;
    const observedCycleService = {
      rotateOnDateChange: async (...args: Parameters<ConfirmationCycleService['rotateOnDateChange']>) => {
        rotationAttempts += 1;
        return cycleService.rotateOnDateChange(...args);
      },
      createInitial: cycleService.createInitial.bind(cycleService),
    } as unknown as ConfirmationCycleService;
    const tokenRepo = new PrismaRentalTenantPortalTokenRepository(harness.prisma);
    const generatePortalToken = new GeneratePortalTokenUseCase(
      tokenRepo,
      new PrismaAppointmentRepository(harness.prisma),
      new PrismaTenantRepository(harness.prisma),
      new MintPortalTokenService(tokenRepo, new TokenService()),
      auditService,
      'https://portal.test',
      undefined,
      observedCycleService,
      harness.prisma,
    );
    let enabledSnapshotObserved = false;
    let policyFlipped = false;
    const groupRepoWithPolicyFlip = {
      findById: repo.findById.bind(repo),
      findGroupAppointmentsWithConfirmation: async (id: string, tx?: Prisma.TransactionClient) => {
        const rows = await repo.findGroupAppointmentsWithConfirmation(id, tx);
        enabledSnapshotObserved = rows.some(
          (row) => row.id === appointmentId && row.rentalTenantNotificationsEnabled,
        );
        if (!tx && !policyFlipped) {
          policyFlipped = true;
          await harness.prisma.tenant.update({
            where: { id: tenantId },
            data: {
              settings_json: {
                rentalTenantNotificationsEnabled: false,
                emailSendingEnabled: false,
              },
            },
          });
        }
        return rows;
      },
      findGroupAppointmentWithConfirmation: repo.findGroupAppointmentWithConfirmation.bind(repo),
    } as unknown as PrismaServiceGroupRepository;
    const idempotency = {
      getWithHash: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as unknown as IIdempotencyService;
    const useCase = new SendGroupPortalLinksUseCase(
      groupRepoWithPolicyFlip,
      generatePortalToken,
      observedCycleService,
      idempotency,
      auditService,
      new AuthorizationService(auditService),
      undefined,
      harness.prisma,
    );

    const result = await useCase.execute({ groupId, actor: makeActor({ role: 'AM' }) });

    expect(enabledSnapshotObserved).toBe(true);
    expect(result.results).toEqual([
      { appointmentId, status: 'TENANT_NOTIFICATIONS_BLOCKED' },
    ]);
    expect(rotationAttempts).toBe(0);
    const after = await harness.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: {
        active_confirmation_cycle_id: true,
        rental_tenant_confirmation_status: true,
        confirmation_cycles: {
          select: { id: true, status: true, portal_token_id: true },
        },
        portal_tokens: {
          select: { id: true, status: true, confirmation_cycle_id: true },
        },
      },
    });
    expect(after).toEqual({
      active_confirmation_cycle_id: before.active_confirmation_cycle_id,
      rental_tenant_confirmation_status: 'CONFIRMED',
      confirmation_cycles: [{
        id: before.active_confirmation_cycle_id,
        status: 'CONFIRMED',
        portal_token_id: originalToken.id,
      }],
      portal_tokens: [{
        id: originalToken.id,
        status: 'ACTIVE',
        confirmation_cycle_id: before.active_confirmation_cycle_id,
      }],
    });
    expect(idempotency.set).not.toHaveBeenCalled();
    const transactionalAuditActions = (auditService.log as ReturnType<typeof vi.fn>).mock.calls
      .map(([entry]) => entry.action)
      .filter((action: string) => (
        action.startsWith('appointment_confirmation_cycle.')
        || action === 'rental_tenant_portal.token_generated'
      ));
    expect(transactionalAuditActions).toEqual([]);
  });

  it('rolls back reset, mint and cycle link when SEND_AFTER_RESET fails after all transactional mutations', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency rollback after mint');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const groupId = await seedGroup(harness.prisma, serviceTypeId, userId);
    const appointmentId = await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId: await seedProperty(harness.prisma, tenantId, branchId),
      serviceTypeId,
      createdByUserId: userId,
      groupId,
      rentalTenantConfirmationStatus: 'CONFIRMED',
      scheduledDate: STALE_DATE,
      activeCycle: { scheduledDate: SCHEDULED_DATE, timeSlot: SLOT, status: 'CONFIRMED' },
    });
    const before = await harness.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: { active_confirmation_cycle_id: true },
    });

    const auditService = { log: vi.fn() } as unknown as AuditService;
    const cycleService = new ConfirmationCycleService(
      new PrismaConfirmationCycleRepository(harness.prisma),
      auditService,
      harness.prisma,
    );
    const tokenRepo = new PrismaRentalTenantPortalTokenRepository(harness.prisma);
    const mint = new MintPortalTokenService(tokenRepo, new TokenService());
    let stateBeforeForcedFailure:
      | {
          cycleCount: number;
          tokenCount: number;
          activeCycleId: string | null;
          linkedTokenId: string | null;
        }
      | undefined;
    const failingCycleService = {
      rotateOnDateChange: cycleService.rotateOnDateChange.bind(cycleService),
      createInitial: async (...args: Parameters<ConfirmationCycleService['createInitial']>) => {
        const created = await cycleService.createInitial(...args);
        const tx = args[5];
        if (!tx) throw new Error('Expected SEND_AFTER_RESET to provide the caller transaction');
        const [cycleCount, tokenCount, appointment] = await Promise.all([
          tx.appointmentConfirmationCycle.count({ where: { appointment_id: appointmentId } }),
          tx.rentalTenantPortalToken.count({ where: { appointment_id: appointmentId } }),
          tx.appointment.findUniqueOrThrow({
            where: { id: appointmentId },
            select: { active_confirmation_cycle_id: true },
          }),
        ]);
        stateBeforeForcedFailure = {
          cycleCount,
          tokenCount,
          activeCycleId: appointment.active_confirmation_cycle_id,
          linkedTokenId: created.portalTokenId,
        };
        throw new Error('forced post-mutation failure');
      },
    } as unknown as ConfirmationCycleService;
    const generatePortalToken = new GeneratePortalTokenUseCase(
      tokenRepo,
      new PrismaAppointmentRepository(harness.prisma),
      new PrismaTenantRepository(harness.prisma),
      mint,
      auditService,
      'https://portal.test',
      undefined,
      failingCycleService,
      harness.prisma,
    );
    const idempotency = {
      getWithHash: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as unknown as IIdempotencyService;
    const useCase = new SendGroupPortalLinksUseCase(
      repo,
      generatePortalToken,
      failingCycleService,
      idempotency,
      auditService,
      new AuthorizationService(auditService),
      undefined,
      harness.prisma,
    );

    const result = await useCase.execute({ groupId, actor: makeActor({ role: 'AM' }) });

    expect(result.results).toEqual([
      {
        appointmentId,
        status: 'ERROR',
        error: { code: 'DISPATCH_FAILED', message: 'forced post-mutation failure' },
      },
    ]);
    expect(stateBeforeForcedFailure).toMatchObject({
      cycleCount: 2,
      tokenCount: 1,
      linkedTokenId: expect.any(String),
    });
    expect(stateBeforeForcedFailure?.activeCycleId).not.toBe(before.active_confirmation_cycle_id);
    const after = await harness.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: {
        active_confirmation_cycle_id: true,
        rental_tenant_confirmation_status: true,
        confirmation_cycles: {
          orderBy: { cycle_number: 'asc' },
          select: { id: true, status: true },
        },
      },
    });
    expect(after.active_confirmation_cycle_id).toBe(before.active_confirmation_cycle_id);
    expect(after.rental_tenant_confirmation_status).toBe('CONFIRMED');
    expect(after.confirmation_cycles).toEqual([
      { id: before.active_confirmation_cycle_id, status: 'CONFIRMED' },
    ]);
    expect(await harness.prisma.rentalTenantPortalToken.count({
      where: { appointment_id: appointmentId },
    })).toBe(0);
    const cycleAuditActions = (auditService.log as ReturnType<typeof vi.fn>).mock.calls
      .map(([entry]) => entry.action)
      .filter((action: string) => action.startsWith('appointment_confirmation_cycle.'));
    expect(cycleAuditActions).toEqual([]);
  });

  it('commits a real SEND_AFTER_RESET reset, mint and cycle link before dispatch', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency successful resend');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const groupId = await seedGroup(harness.prisma, serviceTypeId, userId);
    const appointmentId = await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId: await seedProperty(harness.prisma, tenantId, branchId),
      serviceTypeId,
      createdByUserId: userId,
      groupId,
      rentalTenantConfirmationStatus: 'CONFIRMED',
      scheduledDate: STALE_DATE,
      activeCycle: { scheduledDate: SCHEDULED_DATE, timeSlot: SLOT, status: 'CONFIRMED' },
    });
    await seedPrimaryContact(harness.prisma, appointmentId);
    const before = await harness.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: { active_confirmation_cycle_id: true },
    });

    const auditService = { log: vi.fn() } as unknown as AuditService;
    const cycleService = new ConfirmationCycleService(
      new PrismaConfirmationCycleRepository(harness.prisma),
      auditService,
      harness.prisma,
    );
    const tokenRepo = new PrismaRentalTenantPortalTokenRepository(harness.prisma);
    const createNotification = { execute: vi.fn().mockResolvedValue({ notificationId: 'notification-1' }) };
    const generatePortalToken = new GeneratePortalTokenUseCase(
      tokenRepo,
      new PrismaAppointmentRepository(harness.prisma),
      new PrismaTenantRepository(harness.prisma),
      new MintPortalTokenService(tokenRepo, new TokenService()),
      auditService,
      'https://portal.test',
      createNotification as never,
      cycleService,
      harness.prisma,
    );
    const idempotency = {
      getWithHash: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as IIdempotencyService;
    const useCase = new SendGroupPortalLinksUseCase(
      repo,
      generatePortalToken,
      cycleService,
      idempotency,
      auditService,
      new AuthorizationService(auditService),
      undefined,
      harness.prisma,
    );

    const result = await useCase.execute({ groupId, actor: makeActor({ role: 'AM' }) });

    expect(result.results).toEqual([{ appointmentId, status: 'DATE_CHANGED_RESENT' }]);
    const after = await harness.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: {
        active_confirmation_cycle_id: true,
        rental_tenant_confirmation_status: true,
        confirmation_cycles: {
          orderBy: { cycle_number: 'asc' },
          select: { id: true, status: true, portal_token_id: true },
        },
        portal_tokens: {
          select: { id: true, status: true, confirmation_cycle_id: true },
        },
      },
    });
    expect(after.active_confirmation_cycle_id).not.toBe(before.active_confirmation_cycle_id);
    expect(after.rental_tenant_confirmation_status).toBe('PENDING');
    expect(after.confirmation_cycles).toEqual([
      { id: before.active_confirmation_cycle_id, status: 'SUPERSEDED', portal_token_id: null },
      {
        id: after.active_confirmation_cycle_id,
        status: 'PENDING',
        portal_token_id: after.portal_tokens[0]!.id,
      },
    ]);
    expect(after.portal_tokens).toEqual([
      {
        id: after.confirmation_cycles[1]!.portal_token_id,
        status: 'ACTIVE',
        confirmation_cycle_id: after.active_confirmation_cycle_id,
      },
    ]);
    expect(createNotification.execute).toHaveBeenCalledTimes(1);
    expect(idempotency.set).toHaveBeenCalledWith(
      expect.stringContaining(`bulk_resend:${appointmentId}:`),
      'bulk_resend_reminder',
      { appointmentId, status: 'DATE_CHANGED_RESENT' },
      36,
    );
  });

  it('serializes concurrent SEND_AFTER_RESET requests against the current cycle before minting', async () => {
    const { tenantId, userId } = await seedTenant(harness.prisma, 'Agency concurrent resend');
    const branchId = await getBranchId(harness.prisma, tenantId);
    const serviceTypeId = await seedServiceType(harness.prisma);
    const groupId = await seedGroup(harness.prisma, serviceTypeId, userId);
    const appointmentId = await seedAppointment(harness.prisma, {
      tenantId,
      branchId,
      propertyId: await seedProperty(harness.prisma, tenantId, branchId),
      serviceTypeId,
      createdByUserId: userId,
      groupId,
      rentalTenantConfirmationStatus: 'CONFIRMED',
      scheduledDate: STALE_DATE,
      activeCycle: { scheduledDate: SCHEDULED_DATE, timeSlot: SLOT, status: 'CONFIRMED' },
    });
    await seedPrimaryContact(harness.prisma, appointmentId);
    const before = await harness.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: { active_confirmation_cycle_id: true },
    });

    const auditService = { log: vi.fn() } as unknown as AuditService;
    const cycleService = new ConfirmationCycleService(
      new PrismaConfirmationCycleRepository(harness.prisma),
      auditService,
      harness.prisma,
    );
    const tokenRepo = new PrismaRentalTenantPortalTokenRepository(harness.prisma);
    const createNotification = { execute: vi.fn().mockResolvedValue({ notificationId: 'notification-1' }) };
    const generatePortalToken = new GeneratePortalTokenUseCase(
      tokenRepo,
      new PrismaAppointmentRepository(harness.prisma),
      new PrismaTenantRepository(harness.prisma),
      new MintPortalTokenService(tokenRepo, new TokenService()),
      auditService,
      'https://portal.test',
      createNotification as never,
      cycleService,
      harness.prisma,
    );
    let snapshotReads = 0;
    let releaseSnapshots!: () => void;
    const snapshotsReady = new Promise<void>((resolve) => {
      releaseSnapshots = resolve;
    });
    const findRowsInTransaction = repo.findGroupAppointmentsWithConfirmation.bind(repo) as (
      id: string,
      tx?: Prisma.TransactionClient,
    ) => Promise<Awaited<ReturnType<typeof repo.findGroupAppointmentsWithConfirmation>>>;
    const concurrentGroupRepo = {
      findById: repo.findById.bind(repo),
      findGroupAppointmentsWithConfirmation: async (id: string, tx?: Prisma.TransactionClient) => {
        if (tx) throw new Error('Current reclassification must not load the full group under the tenant lock');
        const rows = await findRowsInTransaction(id);

        snapshotReads += 1;
        if (snapshotReads === 2) releaseSnapshots();
        await snapshotsReady;
        return rows;
      },
      findGroupAppointmentWithConfirmation: repo.findGroupAppointmentWithConfirmation.bind(repo),
    } as unknown as PrismaServiceGroupRepository;
    const idempotency = {
      getWithHash: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as IIdempotencyService;
    const useCase = new SendGroupPortalLinksUseCase(
      concurrentGroupRepo,
      generatePortalToken,
      cycleService,
      idempotency,
      auditService,
      new AuthorizationService(auditService),
      undefined,
      harness.prisma,
    );

    const [first, second] = await Promise.all([
      useCase.execute({ groupId, actor: makeActor({ role: 'AM' }) }),
      useCase.execute({ groupId, actor: makeActor({ role: 'AM' }) }),
    ]);

    expect(snapshotReads).toBe(2);
    expect([first.results[0]!.status, second.results[0]!.status].sort()).toEqual([
      'DATE_CHANGED_RESENT',
      'IDEMPOTENT_REPLAY',
    ]);
    const after = await harness.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: {
        active_confirmation_cycle_id: true,
        rental_tenant_confirmation_status: true,
        confirmation_cycles: {
          orderBy: { cycle_number: 'asc' },
          select: { id: true, status: true, portal_token_id: true },
        },
        portal_tokens: {
          select: { id: true, status: true, confirmation_cycle_id: true },
        },
      },
    });
    expect(after.rental_tenant_confirmation_status).toBe('PENDING');
    expect(after.confirmation_cycles).toEqual([
      { id: before.active_confirmation_cycle_id, status: 'SUPERSEDED', portal_token_id: null },
      {
        id: after.active_confirmation_cycle_id,
        status: 'PENDING',
        portal_token_id: after.portal_tokens[0]!.id,
      },
    ]);
    expect(after.portal_tokens).toEqual([
      {
        id: after.confirmation_cycles[1]!.portal_token_id,
        status: 'ACTIVE',
        confirmation_cycle_id: after.active_confirmation_cycle_id,
      },
    ]);
    expect(createNotification.execute).toHaveBeenCalledTimes(1);
  });

  it('holds the tenant notification-policy row lock until the transaction commits', async () => {
    const { tenantId } = await seedTenant(harness.prisma, 'Agency policy lock');
    const tenantRepo = new PrismaTenantRepository(harness.prisma);
    let updatePromise: Promise<number> | undefined;
    let blockedActivity:
      | { state: string; wait_event_type: string | null; wait_event: string | null }
      | undefined;
    const marker = `tenant_policy_lock_${rand()}`;

    await harness.prisma.$transaction(async (tx) => {
      const tenant = await tenantRepo.findById(tenantId, tx, true);
      expect(tenant).not.toBeNull();

      updatePromise = harness.prisma.$executeRawUnsafe(
        `/* ${marker} */ UPDATE tenants SET settings_json = $1::jsonb WHERE id = $2`,
        JSON.stringify({ rentalTenantNotificationsEnabled: false, emailSendingEnabled: false }),
        tenantId,
      ).then((count) => count);
      blockedActivity = await waitForBlockedQuery(harness.prisma, marker);
    });

    expect(blockedActivity).toMatchObject({ state: 'active', wait_event_type: 'Lock' });
    await updatePromise;
    const updated = await harness.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(updated.settings_json).toMatchObject({ rentalTenantNotificationsEnabled: false });
  });
});
