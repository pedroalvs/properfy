/**
 * Group date-sync — real-database verification.
 *
 * Feature: appointments always follow their service group's scheduled date.
 * Editing a DRAFT group's date re-schedules every member appointment via
 * `appointmentRepo.update(appt.id, appt.tenantId, …)`. A mock would return
 * success regardless of the `tenant_id` WHERE filter, masking exactly the
 * tenant-scope bug we care about — so this proves the contract on PostgreSQL.
 *
 * What's covered:
 *   1. Cross-tenant propagation: a DRAFT group with members from tenants A+B
 *      gets BOTH members re-scheduled when the group date changes (each write
 *      scoped to the member's own tenant).
 *   2. Tenant boundary: `PrismaAppointmentRepository.update` with a mismatched
 *      tenant_id is a no-op — the row is untouched.
 *   3. `findAddableForAppointments` excludes past-dated groups (the date sync
 *      must never move an appointment into the past) while returning
 *      future-dated groups regardless of the appointments' own dates.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { UpdateServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/update-service-group.use-case';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { futureDateStr } from '../../helpers/date-fixtures';

function silentAuditService(): AuditService {
  return { log: () => {} } as unknown as AuditService;
}

function amActor(userId: string): AuthContext {
  return { userId, tenantId: null, role: 'AM', branchId: null, inspectorId: null };
}

interface TenantFixture {
  tenantId: string;
  branchId: string;
  userId: string;
  propertyId: string;
}

async function seedTenant(prisma: PrismaClient, name: string): Promise<TenantFixture> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const tenant = await prisma.tenant.create({
    data: { name, legal_name: `${name} LLC ${suffix}`, status: 'ACTIVE' },
  });
  const branch = await prisma.branch.create({
    data: { tenant_id: tenant.id, name: `${name} Branch`, status: 'ACTIVE' },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      role: 'OP',
      name: `${name} Actor`,
      email: `sgds-${suffix}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      property_code: `SGDS-${suffix}`,
      type: 'HOUSE',
      street: '1 Test St',
      suburb: 'Test',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  return { tenantId: tenant.id, branchId: branch.id, userId: user.id, propertyId: property.id };
}

async function seedAppointment(
  prisma: PrismaClient,
  fx: TenantFixture,
  serviceTypeId: string,
  scheduledDate: string,
  serviceGroupId: string | null,
): Promise<string> {
  const appt = await prisma.appointment.create({
    data: {
      tenant_id: fx.tenantId,
      branch_id: fx.branchId,
      property_id: fx.propertyId,
      service_type_id: serviceTypeId,
      service_group_id: serviceGroupId,
      status: 'AWAITING_INSPECTOR',
      scheduled_date: new Date(scheduledDate),
      time_slot_start: '09:00', time_slot_end: '10:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: fx.userId,
    },
  });
  return appt.id;
}

const GROUP_DATE = futureDateStr(30);
const NEW_GROUP_DATE = futureDateStr(45);

describe('service group date sync (real DB)', () => {
  let harness: DbHarness | undefined;
  let prisma: PrismaClient;
  let tenantA: TenantFixture;
  let tenantB: TenantFixture;
  let serviceTypeId: string;
  let groupId: string;
  let apptAId: string;
  let apptBId: string;

  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma = harness.prisma;

    tenantA = await seedTenant(prisma, 'SGDS Tenant A');
    tenantB = await seedTenant(prisma, 'SGDS Tenant B');

    const stSuffix = Math.random().toString(36).slice(2, 10);
    const serviceType = await prisma.serviceType.create({
      data: {
        code: `SGDS-ST-${stSuffix}`,
        name: `SGDS Routine ${stSuffix}`,
        flow_type: 'ROUTINE',
        requires_rental_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });
    serviceTypeId = serviceType.id;

    const group = await prisma.serviceGroup.create({
      data: {
        service_type_id: serviceTypeId,
        status: 'DRAFT',
        group_size: 2,
        scheduled_date: new Date(GROUP_DATE),
        time_window: '09:00-12:00',
        created_by_user_id: tenantA.userId,
      },
    });
    groupId = group.id;

    apptAId = await seedAppointment(prisma, tenantA, serviceTypeId, GROUP_DATE, groupId);
    apptBId = await seedAppointment(prisma, tenantB, serviceTypeId, GROUP_DATE, groupId);
  }, 120_000);

  afterAll(async () => {
    if (harness) await teardownDbHarness(harness);
  });

  it('re-schedules members of every tenant when a DRAFT group date changes', async () => {
    const auditService = silentAuditService();
    const useCase = new UpdateServiceGroupUseCase(
      new PrismaServiceGroupRepository(prisma),
      auditService,
      new AuthorizationService(auditService),
      new PrismaAppointmentRepository(prisma),
    );

    await useCase.execute({
      groupId,
      scheduledDate: NEW_GROUP_DATE,
      actor: amActor(tenantA.userId),
    });

    const rows = await prisma.appointment.findMany({
      where: { id: { in: [apptAId, apptBId] } },
      select: { id: true, scheduled_date: true },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.scheduled_date.toISOString().slice(0, 10)).toBe(NEW_GROUP_DATE);
    }
  });

  it('update with a mismatched tenant_id is a no-op (tenant boundary)', async () => {
    // Self-contained baseline: a fresh ungrouped appointment, independent of
    // whatever the reschedule test above did to the group members.
    const baselineDate = futureDateStr(60);
    const boundaryApptId = await seedAppointment(prisma, tenantA, serviceTypeId, baselineDate, null);

    const repo = new PrismaAppointmentRepository(prisma);
    // Tenant B's id against tenant A's appointment: the WHERE must not match.
    await repo.update(boundaryApptId, tenantB.tenantId, { scheduledDate: new Date(futureDateStr(90)) });

    const row = await prisma.appointment.findUnique({
      where: { id: boundaryApptId },
      select: { scheduled_date: true },
    });
    expect(row!.scheduled_date.toISOString().slice(0, 10)).toBe(baselineDate);
  });

  it('findAddableForAppointments excludes past-dated groups and ignores appointment dates', async () => {
    const pastGroup = await prisma.serviceGroup.create({
      data: {
        service_type_id: serviceTypeId,
        status: 'DRAFT',
        group_size: 1,
        scheduled_date: new Date('2020-01-01'),
        time_window: '09:00-12:00',
        created_by_user_id: tenantA.userId,
      },
    });

    const repo = new PrismaServiceGroupRepository(prisma);
    const groups = await repo.findAddableForAppointments({ serviceTypeId, batchSize: 1 });
    const ids = groups.map((g) => g.id);

    expect(ids).toContain(groupId);
    expect(ids).not.toContain(pastGroup.id);
  });
});
