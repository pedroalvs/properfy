/**
 * `unpublishOptimistic` — real-database verification of the accept race.
 *
 * Unpublishing is `PUBLISHED → DRAFT`, and the only thing standing between it
 * and a stolen assignment is the `status = 'PUBLISHED'` predicate living inside
 * the UPDATE. A mocked Prisma returns whatever the mock says, so it cannot tell
 * a conditional update from an unconditional one — exactly the distinction that
 * matters here.
 *
 * What's covered:
 *   1. The happy path clears `published_at` along with the status, so a
 *      re-publish re-stamps it instead of reporting the first offer's date.
 *   2. Member appointments are untouched: they stay AWAITING_INSPECTOR and
 *      stay linked, which is what lets `publish` run again unchanged.
 *   3. An ACCEPTED group is refused at the SQL level (0 rows) and keeps its
 *      inspector. Drop the `status: 'PUBLISHED'` condition from the WHERE and
 *      this case fails — it is the guard's proof.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';

interface Fixture {
  tenantId: string;
  branchId: string;
  userId: string;
  propertyId: string;
  serviceTypeId: string;
  inspectorId: string;
}

async function seedFixture(prisma: PrismaClient): Promise<Fixture> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const tenant = await prisma.tenant.create({
    data: { name: `Unpublish ${suffix}`, legal_name: `Unpublish LLC ${suffix}`, status: 'ACTIVE' },
  });
  const branch = await prisma.branch.create({
    data: { tenant_id: tenant.id, name: `Branch ${suffix}`, status: 'ACTIVE' },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      role: 'OP',
      name: `Actor ${suffix}`,
      email: `unpublish-${suffix}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      property_code: `UNP-${suffix}`,
      type: 'HOUSE',
      street: '1 Unpublish St',
      suburb: 'Testville',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  const serviceType = await prisma.serviceType.create({
    data: {
      code: `UNP-ST-${suffix}`,
      name: `Unpublish Routine ${suffix}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  const inspector = await prisma.inspector.create({
    data: {
      name: `Inspector ${suffix}`,
      email: `unpublish-insp-${suffix}@test.local`,
      status: 'ACTIVE',
    },
  });
  return {
    tenantId: tenant.id,
    branchId: branch.id,
    userId: user.id,
    propertyId: property.id,
    serviceTypeId: serviceType.id,
    inspectorId: inspector.id,
  };
}

describe('unpublishOptimistic (real DB)', () => {
  let harness: DbHarness | undefined;
  let fx: Fixture;
  let repo: PrismaServiceGroupRepository;

  beforeAll(async () => {
    harness = await setupDbHarness();
    fx = await seedFixture(harness.prisma);
    repo = new PrismaServiceGroupRepository(harness.prisma);
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function prisma(): PrismaClient {
    if (!harness) throw new Error('harness not initialized');
    return harness.prisma;
  }

  async function createGroup(
    status: 'PUBLISHED' | 'ACCEPTED',
    assignedInspectorId: string | null = null,
  ): Promise<string> {
    const group = await prisma().serviceGroup.create({
      data: {
        service_type_id: fx.serviceTypeId,
        status,
        scheduled_date: new Date('2026-08-12'),
        time_window: '09:00-10:00',
        created_by_user_id: fx.userId,
        published_at: new Date('2026-08-01'),
        offered_count: 1,
        assigned_inspector_id: assignedInspectorId,
      },
    });
    return group.id;
  }

  async function createMember(groupId: string, status: string, inspectorId: string | null = null) {
    const appt = await prisma().appointment.create({
      data: {
        tenant_id: fx.tenantId,
        branch_id: fx.branchId,
        property_id: fx.propertyId,
        service_type_id: fx.serviceTypeId,
        service_group_id: groupId,
        inspector_id: inspectorId,
        status: status as never,
        scheduled_date: new Date('2026-08-12'),
        time_slot_start: '09:00',
        time_slot_end: '10:00',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        rental_tenant_confirmation_status: 'PENDING',
        created_by_user_id: fx.userId,
      },
    });
    return appt.id;
  }

  it('moves a PUBLISHED group to DRAFT and clears published_at', async () => {
    const groupId = await createGroup('PUBLISHED');

    expect(await repo.unpublishOptimistic(groupId)).toBe(1);

    const row = await prisma().serviceGroup.findUnique({ where: { id: groupId } });
    expect(row?.status).toBe('DRAFT');
    expect(row?.published_at).toBeNull();
    // The lifetime offer counter is history, not state — re-publishing bumps it.
    expect(row?.offered_count).toBe(1);
  });

  it('leaves the member appointments exactly as they were', async () => {
    const groupId = await createGroup('PUBLISHED');
    const memberId = await createMember(groupId, 'AWAITING_INSPECTOR');

    await repo.unpublishOptimistic(groupId);

    const member = await prisma().appointment.findUnique({ where: { id: memberId } });
    expect(member?.status).toBe('AWAITING_INSPECTOR');
    expect(member?.service_group_id).toBe(groupId);
    expect(member?.inspector_id).toBeNull();
  });

  it('refuses a group an inspector already accepted, keeping the assignment', async () => {
    const groupId = await createGroup('ACCEPTED', fx.inspectorId);
    const memberId = await createMember(groupId, 'SCHEDULED', fx.inspectorId);

    expect(await repo.unpublishOptimistic(groupId)).toBe(0);

    const row = await prisma().serviceGroup.findUnique({ where: { id: groupId } });
    expect(row?.status).toBe('ACCEPTED');
    expect(row?.assigned_inspector_id).toBe(fx.inspectorId);

    const member = await prisma().appointment.findUnique({ where: { id: memberId } });
    expect(member?.status).toBe('SCHEDULED');
    expect(member?.inspector_id).toBe(fx.inspectorId);
  });
});
