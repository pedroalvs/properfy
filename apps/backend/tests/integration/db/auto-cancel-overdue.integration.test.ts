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
    /** Full instant for `created_at` — this is what the overdue age rule reads. */
    createdAt?: string;
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
        // Default to well before any cutoff these tests use, so a fixture is overdue
        // unless a test says otherwise.
        ...(opts.createdAt ? { created_at: new Date(opts.createdAt) } : { created_at: new Date('2026-01-01T00:00:00.000Z') }),
        ...(opts.deleted ? { deleted_at: new Date() } : {}),
      },
    });
    return appt.id;
  }

  describe('findOverdueForAutoCancel', () => {
    // Today is 2026-07-29 in Sydney; 45 days back is the civil date 2026-06-14, whose
    // Sydney midnight (AEST, +10) is this instant. Same value startOfOverdueAgeCutoff()
    // produces — restated here so the SQL boundary is asserted independently.
    const CUTOFF = new Date('2026-06-13T14:00:00.000Z');

    it('returns only cancellable appointments created strictly before the cutoff', async () => {
      const oldAwaiting = await createAppointment({
        date: '2026-07-20', status: 'AWAITING_INSPECTOR', createdAt: '2026-05-01T00:00:00.000Z',
      });
      const oldScheduled = await createAppointment({
        date: '2026-07-28', status: 'SCHEDULED', createdAt: '2026-06-01T00:00:00.000Z',
      });
      const oldDraft = await createAppointment({
        date: '2026-07-20', status: 'DRAFT', createdAt: '2026-05-01T00:00:00.000Z',
      });
      const oldDone = await createAppointment({
        date: '2026-07-20', status: 'DONE', createdAt: '2026-05-01T00:00:00.000Z',
      });
      const oldCancelled = await createAppointment({
        date: '2026-07-20', status: 'CANCELLED', createdAt: '2026-05-01T00:00:00.000Z',
      });
      const recent = await createAppointment({
        date: '2026-07-20', status: 'SCHEDULED', createdAt: '2026-07-25T00:00:00.000Z',
      });

      const ids = (await appointmentRepo.findOverdueForAutoCancel(CUTOFF, 500)).map((a) => a.id);

      expect(ids).toContain(oldAwaiting);
      expect(ids).toContain(oldScheduled);

      // DRAFT carries the overdue badge but is the operator's repair state — the
      // sweep must never cancel it.
      expect(ids).not.toContain(oldDraft);
      expect(ids).not.toContain(oldDone);
      expect(ids).not.toContain(oldCancelled);
      // Younger than the threshold, however old its scheduled date is.
      expect(ids).not.toContain(recent);
    });

    it('selects a FUTURE-dated appointment that has been stalled too long', async () => {
      // The semantic change, provable only against real SQL: under the old
      // scheduled_date rule this row could never be selected. Under the age rule a
      // record parked with a far-future date is exactly what needs surfacing.
      const futureDatedButStale = await createAppointment({
        date: '2026-12-25', status: 'SCHEDULED', createdAt: '2026-05-01T00:00:00.000Z',
      });

      const ids = (await appointmentRepo.findOverdueForAutoCancel(CUTOFF, 500)).map((a) => a.id);

      expect(ids).toContain(futureDatedButStale);
    });

    it('excludes soft-deleted appointments', async () => {
      const deleted = await createAppointment({
        date: '2026-07-20', status: 'SCHEDULED', createdAt: '2026-05-01T00:00:00.000Z', deleted: true,
      });

      const found = await appointmentRepo.findOverdueForAutoCancel(CUTOFF, 500);

      expect(found.map((a) => a.id)).not.toContain(deleted);
    });

    it('compares against the Sydney-midnight INSTANT, not UTC midnight of that date', async () => {
      // created_at is a real timestamp, so the cutoff must be too. This row was created
      // at 06:00 on 2026-06-14 in Sydney — ON the cutoff civil day, so exactly 45 days
      // old and NOT yet overdue.
      const onCutoffDayInSydney = await createAppointment({
        date: '2026-07-20', status: 'SCHEDULED', createdAt: '2026-06-13T20:00:00.000Z',
      });

      const correct = (await appointmentRepo.findOverdueForAutoCancel(CUTOFF, 500)).map((a) => a.id);
      expect(correct).not.toContain(onCutoffDayInSydney);

      // Reusing startOfPlatformToday's @db.Date convention (UTC midnight of the civil
      // date) would put the cutoff 10h later and wrongly cancel this appointment a
      // day early — the regression this test exists to catch.
      const naiveUtcCutoff = new Date('2026-06-14T00:00:00.000Z');
      const naive = (await appointmentRepo.findOverdueForAutoCancel(naiveUtcCutoff, 500)).map((a) => a.id);
      expect(naive).toContain(onCutoffDayInSydney);
    });

    it('drains the oldest records first', async () => {
      const newer = await createAppointment({
        date: '2026-07-20', status: 'SCHEDULED', createdAt: '2026-06-01T00:00:00.000Z',
      });
      const older = await createAppointment({
        date: '2026-07-20', status: 'SCHEDULED', createdAt: '2026-02-01T00:00:00.000Z',
      });

      const ids = (await appointmentRepo.findOverdueForAutoCancel(CUTOFF, 500)).map((a) => a.id);

      expect(ids.indexOf(older)).toBeLessThan(ids.indexOf(newer));
    });

    it('honours the batch limit', async () => {
      await createAppointment({ date: '2026-07-01', status: 'SCHEDULED', createdAt: '2026-03-01T00:00:00.000Z' });
      await createAppointment({ date: '2026-07-02', status: 'SCHEDULED', createdAt: '2026-03-02T00:00:00.000Z' });

      const found = await appointmentRepo.findOverdueForAutoCancel(CUTOFF, 1);

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

    // The emptiness check must live in the same statement as the write. Otherwise an
    // appointment linked into the group between the read and the write is orphaned
    // onto a CANCELLED group — worse than a duplicate audit row.
    it('refuses to cancel a group that gained a live member after it was read', async () => {
      const groupId = await createGroup('PUBLISHED');
      await createAppointment({ date: '2026-08-12', status: 'CANCELLED', groupId });

      // Simulates add-appointments-to-group landing between findById and the write.
      await createAppointment({ date: '2026-08-12', status: 'AWAITING_INSPECTOR', groupId });

      expect(await groupRepo.cancelOptimistic(groupId, 'PUBLISHED')).toBe(0);
      expect((await prisma().serviceGroup.findUnique({ where: { id: groupId } }))?.status)
        .toBe('PUBLISHED');
    });

    it('refuses to cancel a group that gained a DONE member after it was read', async () => {
      const groupId = await createGroup('ACCEPTED');
      await createAppointment({ date: '2026-08-12', status: 'DONE', groupId });

      expect(await groupRepo.cancelOptimistic(groupId, 'ACCEPTED')).toBe(0);
      expect((await prisma().serviceGroup.findUnique({ where: { id: groupId } }))?.status)
        .toBe('ACCEPTED');
    });

    it('still cancels when the only member is soft-deleted', async () => {
      const groupId = await createGroup('PUBLISHED');
      await createAppointment({
        date: '2026-08-12', status: 'AWAITING_INSPECTOR', groupId, deleted: true,
      });

      expect(await groupRepo.cancelOptimistic(groupId, 'PUBLISHED')).toBe(1);
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
