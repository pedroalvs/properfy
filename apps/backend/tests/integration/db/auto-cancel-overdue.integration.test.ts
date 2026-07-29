/**
 * Auto-cancel of overdue appointments and dead service groups — real-database verification.
 *
 * These MUST run against real PostgreSQL. Both behaviours under test live in the
 * SQL, not in the use case, so a mocked repository would assert nothing:
 *
 *   1. `findOverdueActive` compares a `@db.Date` column against a cutoff derived
 *      from the *Sydney* civil date. A mock cannot show that an appointment dated
 *      "today in Sydney" survives while the server clock is still on yesterday UTC.
 *   2. `CancelEmptyGroupService` relies on `findById` filtering `deleted_at`.
 *      Soft-delete clears no `service_group_id`, so a deleted appointment stays
 *      linked in the table — only the query decides whether it keeps a group alive.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaServiceGroupRepository } from '../../../src/modules/service-group/infrastructure/prisma-service-group.repository';
import { CancelEmptyGroupService } from '../../../src/modules/service-group/application/services/cancel-empty-group.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { Logger } from '../../../src/shared/infrastructure/logger';

function silentAuditService(): AuditService {
  return { log: () => {} } as unknown as AuditService;
}

function silentLogger(): Logger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as Logger;
}

interface Fixture {
  tenantId: string;
  branchId: string;
  userId: string;
  propertyId: string;
  serviceTypeId: string;
}

async function seedFixture(prisma: PrismaClient): Promise<Fixture> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const tenant = await prisma.tenant.create({
    data: { name: `Overdue ${suffix}`, legal_name: `Overdue LLC ${suffix}`, status: 'ACTIVE' },
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
      email: `overdue-${suffix}@test.local`,
      password_hash: '$2a$10$fakehashfakehashfakehashfakehashfake',
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenant.id,
      branch_id: branch.id,
      property_code: `OVD-${suffix}`,
      type: 'HOUSE',
      street: '1 Overdue St',
      suburb: 'Testville',
      postcode: '2000',
      state: 'NSW',
      country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  const serviceType = await prisma.serviceType.create({
    data: {
      code: `OVD-ST-${suffix}`,
      name: `Overdue Routine ${suffix}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  return {
    tenantId: tenant.id,
    branchId: branch.id,
    userId: user.id,
    propertyId: property.id,
    serviceTypeId: serviceType.id,
  };
}

describe('auto-cancel overdue appointments and dead groups (real DB)', () => {
  let harness: DbHarness | undefined;
  let fx: Fixture;
  let appointmentRepo: PrismaAppointmentRepository;
  let groupRepo: PrismaServiceGroupRepository;

  beforeAll(async () => {
    harness = await setupDbHarness();
    fx = await seedFixture(harness.prisma);
    appointmentRepo = new PrismaAppointmentRepository(harness.prisma);
    groupRepo = new PrismaServiceGroupRepository(harness.prisma);
  }, 180_000);

  afterAll(async () => {
    await teardownDbHarness(harness);
  });

  function prisma(): PrismaClient {
    if (!harness) throw new Error('harness not initialized');
    return harness.prisma;
  }

  async function createGroup(
    status: 'DRAFT' | 'PUBLISHED' | 'ACCEPTED' | 'CANCELLED' = 'PUBLISHED',
  ): Promise<string> {
    const group = await prisma().serviceGroup.create({
      data: {
        service_type_id: fx.serviceTypeId,
        status,
        scheduled_date: new Date('2026-08-12'),
        time_window: '09:00-10:00',
        created_by_user_id: fx.userId,
      },
    });
    return group.id;
  }

  async function createAppointment(opts: {
    date: string;
    status: 'DRAFT' | 'AWAITING_INSPECTOR' | 'SCHEDULED' | 'DONE' | 'CANCELLED' | 'REJECTED';
    groupId?: string | null;
    deleted?: boolean;
  }): Promise<string> {
    const appt = await prisma().appointment.create({
      data: {
        tenant_id: fx.tenantId,
        branch_id: fx.branchId,
        property_id: fx.propertyId,
        service_type_id: fx.serviceTypeId,
        service_group_id: opts.groupId ?? null,
        status: opts.status,
        // @db.Date pinned to UTC midnight of the intended Sydney civil date.
        scheduled_date: new Date(`${opts.date}T00:00:00.000Z`),
        time_slot_start: '09:00',
        time_slot_end: '10:00',
        price_amount: '100.00',
        payout_amount: '80.00',
        pricing_rule_snapshot_json: {},
        rental_tenant_confirmation_status: 'PENDING',
        created_by_user_id: fx.userId,
        ...(opts.deleted ? { deleted_at: new Date() } : {}),
      },
    });
    return appt.id;
  }

  describe('findOverdueActive', () => {
    it('returns only active appointments strictly before the cutoff', async () => {
      const cutoff = new Date('2026-07-29T00:00:00.000Z');

      const pastAwaiting = await createAppointment({ date: '2026-07-20', status: 'AWAITING_INSPECTOR' });
      const pastScheduled = await createAppointment({ date: '2026-07-28', status: 'SCHEDULED' });
      const pastDraft = await createAppointment({ date: '2026-07-20', status: 'DRAFT' });
      const pastDone = await createAppointment({ date: '2026-07-20', status: 'DONE' });
      const pastCancelled = await createAppointment({ date: '2026-07-20', status: 'CANCELLED' });
      const today = await createAppointment({ date: '2026-07-29', status: 'SCHEDULED' });
      const future = await createAppointment({ date: '2026-08-10', status: 'SCHEDULED' });

      const found = await appointmentRepo.findOverdueActive(cutoff, 500);
      const ids = found.map((a) => a.id);

      expect(ids).toContain(pastAwaiting);
      expect(ids).toContain(pastScheduled);

      // DRAFT is not "late" — it was never released.
      expect(ids).not.toContain(pastDraft);
      expect(ids).not.toContain(pastDone);
      expect(ids).not.toContain(pastCancelled);
      // Strictly before the cutoff: today's appointment is never swept.
      expect(ids).not.toContain(today);
      expect(ids).not.toContain(future);
    });

    it('excludes soft-deleted appointments', async () => {
      const cutoff = new Date('2026-07-29T00:00:00.000Z');
      const deleted = await createAppointment({
        date: '2026-07-20',
        status: 'SCHEDULED',
        deleted: true,
      });

      const found = await appointmentRepo.findOverdueActive(cutoff, 500);

      expect(found.map((a) => a.id)).not.toContain(deleted);
    });

    it('treats an appointment dated today-in-Sydney as not overdue, even while UTC is on yesterday', async () => {
      // 2026-07-29T23:00Z is already 09:00 on the 30th in Sydney, so the sweep's
      // cutoff is the 30th. An appointment dated the 30th must still survive; one
      // dated the 29th is now genuinely past.
      const sydneyCutoff = new Date('2026-07-30T00:00:00.000Z');
      const naiveUtcCutoff = new Date('2026-07-29T00:00:00.000Z');

      const the29th = await createAppointment({ date: '2026-07-29', status: 'SCHEDULED' });
      const the30th = await createAppointment({ date: '2026-07-30', status: 'SCHEDULED' });

      const sydneyResult = (await appointmentRepo.findOverdueActive(sydneyCutoff, 500)).map((a) => a.id);
      expect(sydneyResult).toContain(the29th);
      expect(sydneyResult).not.toContain(the30th);

      // The old naive-UTC cutoff would have missed the 29th entirely — the bug.
      const naiveResult = (await appointmentRepo.findOverdueActive(naiveUtcCutoff, 500)).map((a) => a.id);
      expect(naiveResult).not.toContain(the29th);
    });

    it('honours the batch limit', async () => {
      const cutoff = new Date('2026-07-29T00:00:00.000Z');
      await createAppointment({ date: '2026-07-01', status: 'SCHEDULED' });
      await createAppointment({ date: '2026-07-02', status: 'SCHEDULED' });

      const found = await appointmentRepo.findOverdueActive(cutoff, 1);

      expect(found).toHaveLength(1);
    });
  });

  describe('CancelEmptyGroupService against real membership queries', () => {
    function makeService(): CancelEmptyGroupService {
      return new CancelEmptyGroupService(groupRepo, silentAuditService(), silentLogger());
    }

    it('cancels a group whose only remaining appointment was soft-deleted', async () => {
      // The deleted row keeps its service_group_id, so only the query's
      // `deleted_at: null` filter makes this group read as empty.
      const groupId = await createGroup('PUBLISHED');
      await createAppointment({
        date: '2026-08-12',
        status: 'AWAITING_INSPECTOR',
        groupId,
        deleted: true,
      });

      expect(await makeService().cancelIfDead(groupId)).toBe(true);

      const after = await prisma().serviceGroup.findUnique({ where: { id: groupId } });
      expect(after?.status).toBe('CANCELLED');
    });

    it('cancels a group whose every live member is CANCELLED', async () => {
      const groupId = await createGroup('ACCEPTED');
      await createAppointment({ date: '2026-08-12', status: 'CANCELLED', groupId });
      await createAppointment({ date: '2026-08-12', status: 'REJECTED', groupId });

      expect(await makeService().cancelIfDead(groupId)).toBe(true);
      expect((await prisma().serviceGroup.findUnique({ where: { id: groupId } }))?.status)
        .toBe('CANCELLED');
    });

    it('leaves a group with a DONE member untouched', async () => {
      const groupId = await createGroup('ACCEPTED');
      await createAppointment({ date: '2026-08-12', status: 'DONE', groupId });
      await createAppointment({ date: '2026-08-12', status: 'CANCELLED', groupId });

      expect(await makeService().cancelIfDead(groupId)).toBe(false);
      expect((await prisma().serviceGroup.findUnique({ where: { id: groupId } }))?.status)
        .toBe('ACCEPTED');
    });

    it('leaves a group with a live member untouched', async () => {
      const groupId = await createGroup('PUBLISHED');
      await createAppointment({ date: '2026-08-12', status: 'AWAITING_INSPECTOR', groupId });

      expect(await makeService().cancelIfDead(groupId)).toBe(false);
      expect((await prisma().serviceGroup.findUnique({ where: { id: groupId } }))?.status)
        .toBe('PUBLISHED');
    });

    it('never cancels a DRAFT group, even when empty', async () => {
      const groupId = await createGroup('DRAFT');

      expect(await makeService().cancelIfDead(groupId)).toBe(false);
      expect((await prisma().serviceGroup.findUnique({ where: { id: groupId } }))?.status)
        .toBe('DRAFT');
    });

    it('does not clear service_group_id on the terminal members it leaves behind', async () => {
      const groupId = await createGroup('PUBLISHED');
      const memberId = await createAppointment({ date: '2026-08-12', status: 'CANCELLED', groupId });

      await makeService().cancelIfDead(groupId);

      const member = await prisma().appointment.findUnique({ where: { id: memberId } });
      expect(member?.service_group_id).toBe(groupId);
    });
  });

  describe('cancelOptimistic — the guard against duplicate cancellation', () => {
    /**
     * Bulk-cancelling a group's members fires one transition event each and the
     * subscriber runs fire-and-forget, so several callers can read the group as
     * still-cancellable and then all write. Only the one that actually claims the
     * row may log and emit.
     *
     * This asserts the repository primitive rather than driving
     * `CancelEmptyGroupService` concurrently: at the service level the reads and
     * writes interleave non-deterministically, and later callers often bail on the
     * in-memory status check before reaching the database — so that version of the
     * test passes even with the predicate removed, which makes it worthless as a
     * guard. Drop `status: expectedStatus` from the `updateMany` and this fails.
     */
    it('lets exactly one of 6 concurrent claimants win', async () => {
      const groupId = await createGroup('PUBLISHED');

      const counts = await Promise.all(
        Array.from({ length: 6 }, () => groupRepo.cancelOptimistic(groupId, 'PUBLISHED')),
      );

      expect(counts.filter((c) => c === 1)).toHaveLength(1);
      expect(counts.filter((c) => c === 0)).toHaveLength(5);
      expect((await prisma().serviceGroup.findUnique({ where: { id: groupId } }))?.status)
        .toBe('CANCELLED');
    });

    it('refuses to cancel when the group already moved on', async () => {
      const groupId = await createGroup('ACCEPTED');

      expect(await groupRepo.cancelOptimistic(groupId, 'PUBLISHED')).toBe(0);
      expect((await prisma().serviceGroup.findUnique({ where: { id: groupId } }))?.status)
        .toBe('ACCEPTED');
    });
  });

  describe('findIdsByStatuses', () => {
    it('returns only groups in the requested statuses', async () => {
      const published = await createGroup('PUBLISHED');
      const accepted = await createGroup('ACCEPTED');
      const draft = await createGroup('DRAFT');
      const cancelled = await createGroup('CANCELLED');

      const ids = await groupRepo.findIdsByStatuses(['PUBLISHED', 'ACCEPTED']);

      expect(ids).toContain(published);
      expect(ids).toContain(accepted);
      expect(ids).not.toContain(draft);
      expect(ids).not.toContain(cancelled);
    });
  });
});
