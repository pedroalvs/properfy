/**
 * `GET /v1/appointments?serviceGroupId=<id>` — real-database verification.
 *
 * Feature: the Appointment map's "Groups" drill-down modal lists a service
 * group's FULL appointment records (same columns as the lasso bulk modal).
 * That data comes only from `ListAppointmentsUseCase`, so the list endpoint
 * gains a `serviceGroupId` membership filter. This test proves the contract
 * against a real PostgreSQL database (no mocks — a mock would return rows
 * regardless of the WHERE clause, masking exactly the bug we care about).
 *
 * What's covered:
 *   1. Filter correctness + cross-tenant completeness: an AM/OP actor with no
 *      tenant filter and `serviceGroupId=G` gets EVERY member of G across
 *      tenants A+B, and NOT the appointment outside the group.
 *   2. Membership semantics: CANCELLED and REJECTED members ARE returned
 *      (the default `status NOT IN (CANCELLED, REJECTED)` exclusion must not
 *      apply to a group-membership query).
 *   3. Row exposure: every returned row carries `serviceGroupId === G`.
 *   4. Tenant isolation (no-leak): a CL_ADMIN of tenant A sees only A's slice
 *      of the cross-tenant group; tenant B's member is excluded.
 *   5. Empty / non-member group → [].
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AuthContext } from '@properfy/shared';
import { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { ListAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/list-appointments.use-case';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

function silentAuditService() {
  return { log: () => {} } as unknown as import('../../../src/shared/infrastructure/audit').AuditService;
}

function opActor(userId: string): AuthContext {
  return { userId, tenantId: null, role: 'OP', branchId: null, inspectorId: null };
}

function clAdminActor(userId: string, tenantId: string): AuthContext {
  return { userId, tenantId, role: 'CL_ADMIN', branchId: null, inspectorId: null };
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
      email: `sg-filter-${suffix}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      property_code: `SGF-${suffix}`,
      type: 'RESIDENTIAL',
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
  status: string,
  serviceGroupId: string | null,
): Promise<string> {
  const appt = await prisma.appointment.create({
    data: {
      tenant_id: fx.tenantId,
      branch_id: fx.branchId,
      property_id: fx.propertyId,
      service_type_id: serviceTypeId,
      service_group_id: serviceGroupId,
      status: status as never,
      scheduled_date: new Date('2026-07-15'),
      time_slot: '09:00-10:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      tenant_confirmation_status: 'PENDING',
      created_by_user_id: fx.userId,
    },
  });
  return appt.id;
}

describe('GET /v1/appointments serviceGroupId filter (real DB)', () => {
  let harness: DbHarness | undefined;
  let tenantA: TenantFixture;
  let tenantB: TenantFixture;
  let groupId: string;
  let emptyGroupId: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    harness = await setupDbHarness();
    const { prisma } = harness;

    tenantA = await seedTenant(prisma, 'SGF Tenant A');
    tenantB = await seedTenant(prisma, 'SGF Tenant B');

    const stSuffix = Math.random().toString(36).slice(2, 10);
    const serviceType = await prisma.serviceType.create({
      data: {
        code: `SGF-ST-${stSuffix}`,
        name: `SGF Routine ${stSuffix}`,
        flow_type: 'ROUTINE',
        requires_tenant_confirmation: true,
        status: 'ACTIVE',
      },
    });

    const group = await prisma.serviceGroup.create({
      data: {
        service_type_id: serviceType.id,
        status: 'PUBLISHED',
        group_size: 4,
        scheduled_date: new Date('2026-07-15'),
        time_window: '09:00-10:00',
        created_by_user_id: tenantA.userId,
      },
    });
    groupId = group.id;

    const emptyGroup = await prisma.serviceGroup.create({
      data: {
        service_type_id: serviceType.id,
        status: 'DRAFT',
        group_size: 2,
        scheduled_date: new Date('2026-07-16'),
        time_window: '10:00-11:00',
        created_by_user_id: tenantA.userId,
      },
    });
    emptyGroupId = emptyGroup.id;

    ids.a1 = await seedAppointment(prisma, tenantA, serviceType.id, 'SCHEDULED', groupId);
    ids.b1 = await seedAppointment(prisma, tenantB, serviceType.id, 'AWAITING_INSPECTOR', groupId);
    ids.aCancelled = await seedAppointment(prisma, tenantA, serviceType.id, 'CANCELLED', groupId);
    ids.aRejected = await seedAppointment(prisma, tenantA, serviceType.id, 'REJECTED', groupId);
    ids.aOutside = await seedAppointment(prisma, tenantA, serviceType.id, 'SCHEDULED', null);
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function makeUseCase() {
    if (!harness) throw new Error('harness not initialized');
    return new ListAppointmentsUseCase(
      new PrismaAppointmentRepository(harness.prisma),
      new AuthorizationService(silentAuditService()),
    );
  }

  it('AM/OP with no tenant filter returns the full cross-tenant membership (incl. cancelled/rejected), excluding non-members', async () => {
    const result = await makeUseCase().execute({
      filters: { serviceGroupId: groupId },
      pagination: { page: 1, pageSize: 50, sortOrder: 'desc' },
      actor: opActor(tenantA.userId),
    });

    const returned = result.data.map((a) => a.id).sort();
    expect(returned).toEqual([ids.a1, ids.b1, ids.aCancelled, ids.aRejected].sort());
    expect(returned).not.toContain(ids.aOutside);
    // Every row exposes its serviceGroupId (drives the modal's group-action gating).
    for (const row of result.data) {
      expect(row.serviceGroupId).toBe(groupId);
    }
  });

  it('CL_ADMIN of tenant A sees only tenant A members of the cross-tenant group (no leak of tenant B)', async () => {
    const result = await makeUseCase().execute({
      filters: { serviceGroupId: groupId },
      pagination: { page: 1, pageSize: 50, sortOrder: 'desc' },
      actor: clAdminActor(tenantA.userId, tenantA.tenantId),
    });

    const returned = result.data.map((a) => a.id).sort();
    expect(returned).toEqual([ids.a1, ids.aCancelled, ids.aRejected].sort());
    expect(returned).not.toContain(ids.b1);
  });

  it('empty / non-member group returns []', async () => {
    const result = await makeUseCase().execute({
      filters: { serviceGroupId: emptyGroupId },
      pagination: { page: 1, pageSize: 50, sortOrder: 'desc' },
      actor: opActor(tenantA.userId),
    });
    expect(result.data).toEqual([]);
  });
});
