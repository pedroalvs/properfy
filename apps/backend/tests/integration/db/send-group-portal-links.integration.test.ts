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
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { seedTenant } from '../service-region/helpers/service-region-fixtures';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { SendGroupPortalLinksUseCase } from '../../../src/modules/service-group/application/use-cases/send-group-portal-links.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { GeneratePortalTokenUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/generate-portal-token.use-case';
import type { ConfirmationCycleService } from '../../../src/modules/appointment/application/services/confirmation-cycle.service';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';

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
      service_type_id: serviceTypeId, status: 'PUBLISHED', group_size: 5,
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

function makeActor(overrides: Partial<AuthContext>): AuthContext {
  return { userId: 'u1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, ...overrides };
}

describe('group Send portal link — real DB', () => {
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
});
