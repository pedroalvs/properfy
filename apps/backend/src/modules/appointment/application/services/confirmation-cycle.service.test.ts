import { describe, it, expect, vi } from 'vitest';
import { ConfirmationCycleService } from './confirmation-cycle.service';
import { ConfirmationCycleEntity } from '../../domain/confirmation-cycle.entity';
import type { IConfirmationCycleRepository } from '../../domain/confirmation-cycle.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { PrismaClient, Prisma } from '@prisma/client';

function makeCycle(overrides: Partial<ConstructorParameters<typeof ConfirmationCycleEntity>[0]> = {}): ConfirmationCycleEntity {
  return new ConfirmationCycleEntity({
    id: 'cycle-1',
    appointmentId: 'appt-1',
    cycleNumber: 1,
    scheduledDate: new Date('2026-06-01'),
    timeSlot: '09:00-10:00',
    status: 'PENDING',
    confirmationSource: null,
    confirmedAt: null,
    invalidatedAt: null,
    invalidatedReason: null,
    portalTokenId: null,
    createdAt: new Date(),
    ...overrides,
  });
}

function makeRepo(): IConfirmationCycleRepository {
  return {
    save: vi.fn(),
    update: vi.fn(),
    findActiveByAppointmentId: vi.fn(),
    findById: vi.fn(),
    realignSchedule: vi.fn(),
    findMaxCycleNumber: vi.fn().mockResolvedValue(0),
  };
}

function makeAudit(): AuditService {
  return { log: vi.fn() } as unknown as AuditService;
}

/** Default appointment row returned by the in-tx `appointment.findUnique` read. */
function makeAppointmentRow(status = 'PENDING') {
  return {
    rental_tenant_confirmation_status: status,
    scheduled_date: new Date('2026-06-01'),
    time_slot_start: '09:00',
    time_slot_end: '10:00',
  };
}

function makePrisma(appointmentStatus = 'PENDING'): PrismaClient {
  const appointmentUpdate = vi.fn();
  // O-11: createInitial/confirm/markUnavailable read the appointment's current
  // confirmation status + schedule in the same transaction.
  const appointmentFindUnique = vi.fn().mockResolvedValue(makeAppointmentRow(appointmentStatus));
  const tokenUpdate = vi.fn();
  const appointment = { updateMany: appointmentUpdate, findUnique: appointmentFindUnique };
  const tx = {
    appointment,
    rentalTenantPortalToken: { update: tokenUpdate },
  } as unknown as Prisma.TransactionClient;
  return {
    $transaction: vi.fn().mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    appointment,
    rentalTenantPortalToken: { update: tokenUpdate },
  } as unknown as PrismaClient;
}

/** A caller-owned tx mock that carries the same reads/writes the service uses. */
function makeTx(appointmentStatus = 'PENDING'): Prisma.TransactionClient {
  return {
    appointment: {
      updateMany: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(makeAppointmentRow(appointmentStatus)),
    },
    rentalTenantPortalToken: { update: vi.fn() },
  } as unknown as Prisma.TransactionClient;
}

describe('ConfirmationCycleService', () => {
  describe('createInitial', () => {
    it('should create a new PENDING cycle when no active cycle exists', async () => {
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(null);
      const prisma = makePrisma();
      const svc = new ConfirmationCycleService(repo, makeAudit(), prisma);

      const result = await svc.createInitial('appt-1', 'tenant-1', new Date('2026-06-01'), '09:00-10:00', 'token-1');

      expect(repo.save).toHaveBeenCalledOnce();
      expect(result.status).toBe('PENDING');
      expect(result.portalTokenId).toBe('token-1');
    });

    // O-11 (option A): a CONFIRMED appointment that has no cycle (confirmed via the
    // automatic email / force / group-join before any manual link) must NOT be reset
    // to PENDING when a link is generated — the first cycle adopts the confirmation.
    it('adopts an existing CONFIRMED appointment into a CONFIRMED cycle, not PENDING (O-11 A)', async () => {
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(null);
      const prisma = makePrisma('CONFIRMED');
      const svc = new ConfirmationCycleService(repo, makeAudit(), prisma);

      const result = await svc.createInitial('appt-1', 'tenant-1', new Date('2026-06-01'), '09:00-10:00', 'token-1');

      expect(result.status).toBe('CONFIRMED');
      expect(repo.save).toHaveBeenCalledOnce();
      // The denorm cache stays CONFIRMED — the confirmation is preserved.
      expect(vi.mocked(prisma.appointment.updateMany)).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ rental_tenant_confirmation_status: 'CONFIRMED' }) }),
      );
    });

    it('opens a fresh PENDING cycle for a non-CONFIRMED appointment (UNAVAILABLE re-opens, decision 2)', async () => {
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(null);
      const prisma = makePrisma('UNAVAILABLE');
      const svc = new ConfirmationCycleService(repo, makeAudit(), prisma);

      const result = await svc.createInitial('appt-1', 'tenant-1', new Date('2026-06-01'), '09:00-10:00', 'token-1');

      expect(result.status).toBe('PENDING');
    });

    it('should link new token to existing PENDING cycle with same date/slot', async () => {
      const existing = makeCycle({ status: 'PENDING', portalTokenId: null });
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(existing);
      const svc = new ConfirmationCycleService(repo, makeAudit(), makePrisma());

      await svc.createInitial('appt-1', 'tenant-1', new Date('2026-06-01'), '09:00-10:00', 'token-new');

      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledOnce();
    });

    it('should throw ConfirmationCycleStateError when existing cycle has different date', async () => {
      const existing = makeCycle({ status: 'PENDING', scheduledDate: new Date('2026-06-02') });
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(existing);
      const svc = new ConfirmationCycleService(repo, makeAudit(), makePrisma());

      await expect(svc.createInitial('appt-1', 'tenant-1', new Date('2026-06-01'), '09:00-10:00', null)).rejects.toThrow('createInitial called with mismatched');
    });

    // WI-B2 (#1056): Postgres aborts a caller-owned transaction on the P2002, so
    // retrying inside it only earns a 25P02. The original P2002 must propagate
    // unchanged for the transaction owner to replay in a fresh transaction.
    it('rethrows a caller-owned P2002 instead of retrying inside the aborted tx', async () => {
      const repo = makeRepo();
      const p2002 = { code: 'P2002', meta: { target: ['appointment_id', 'cycle_number'] } };
      vi.mocked(repo.findActiveByAppointmentId)
        .mockResolvedValueOnce(null) // run(): no active cycle → insert path
        .mockResolvedValueOnce(makeCycle({ status: 'PENDING' })); // an in-tx retry would read here
      vi.mocked(repo.save).mockRejectedValue(p2002);
      const tx = makeTx();
      const svc = new ConfirmationCycleService(repo, makeAudit(), makePrisma());

      await expect(
        svc.createInitial('appt-1', 'tenant-1', new Date('2026-06-01'), '09:00-10:00', 'token-1', tx),
      ).rejects.toBe(p2002);
      // Exactly one read: the insert attempt. No second read means no in-tx retry.
      expect(repo.findActiveByAppointmentId).toHaveBeenCalledOnce();
    });

    it('still retries via a fresh transaction when it owns the transaction (no caller tx)', async () => {
      const repo = makeRepo();
      const p2002 = { code: 'P2002', meta: { target: ['appointment_id', 'cycle_number'] } };
      const existing = makeCycle({ status: 'PENDING', portalTokenId: null });
      vi.mocked(repo.findActiveByAppointmentId)
        .mockResolvedValueOnce(null) // run(): insert path
        .mockResolvedValueOnce(existing); // retry(): link-to-existing
      vi.mocked(repo.save).mockRejectedValue(p2002);
      const svc = new ConfirmationCycleService(repo, makeAudit(), makePrisma());

      const result = await svc.createInitial('appt-1', 'tenant-1', new Date('2026-06-01'), '09:00-10:00', 'token-new');

      expect(result.id).toBe(existing.id);
      expect(repo.update).toHaveBeenCalledOnce();
    });
  });

  describe('confirm', () => {
    it('should mark cycle CONFIRMED and update denorm', async () => {
      const cycle = makeCycle({ status: 'PENDING' });
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(cycle);
      const svc = new ConfirmationCycleService(repo, makeAudit(), makePrisma());

      const result = await svc.confirm('appt-1', 'tenant-1', 'RENTAL_TENANT_PORTAL', 'token-1');

      expect(result.status).toBe('CONFIRMED');
      expect(repo.update).toHaveBeenCalledOnce();
    });

    it('should be idempotent when cycle is already CONFIRMED', async () => {
      const cycle = makeCycle({ status: 'CONFIRMED' });
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(cycle);
      const svc = new ConfirmationCycleService(repo, makeAudit(), makePrisma());

      const result = await svc.confirm('appt-1', 'tenant-1', 'RENTAL_TENANT_PORTAL', null);

      expect(result.status).toBe('CONFIRMED');
      expect(repo.update).not.toHaveBeenCalled();
    });

    // O-11 (option B): a confirmation can arrive before any cycle exists (automatic
    // SCHEDULED email, force-confirm, group join). confirm() now CREATES the cycle
    // already CONFIRMED instead of throwing ConfirmationCycleNotFoundError, so the
    // confirmation is durable and a later portal link adopts it.
    it('creates a CONFIRMED cycle when no active cycle exists (O-11 B)', async () => {
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(null);
      const prisma = makePrisma('PENDING');
      const svc = new ConfirmationCycleService(repo, makeAudit(), prisma);

      const result = await svc.confirm('appt-1', 'tenant-1', 'RENTAL_TENANT_PORTAL', 'token-1');

      expect(result.status).toBe('CONFIRMED');
      expect(result.confirmationSource).toBe('RENTAL_TENANT_PORTAL');
      expect(repo.save).toHaveBeenCalledOnce();
      // The denorm cache is set to CONFIRMED on the created cycle.
      expect(vi.mocked(prisma.appointment.updateMany)).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ rental_tenant_confirmation_status: 'CONFIRMED' }) }),
      );
    });

    it('still throws ConfirmationCycleNotFoundError if the appointment vanished mid-tx', async () => {
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(null);
      const prisma = makePrisma();
      vi.mocked(prisma.appointment.findUnique).mockResolvedValue(null as never);
      const svc = new ConfirmationCycleService(repo, makeAudit(), prisma);

      await expect(svc.confirm('appt-1', 'tenant-1', 'RENTAL_TENANT_PORTAL', null)).rejects.toThrow();
    });
  });

  describe('markUnavailable', () => {
    it('should be idempotent when already UNAVAILABLE', async () => {
      const cycle = makeCycle({ status: 'UNAVAILABLE' });
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(cycle);
      const svc = new ConfirmationCycleService(repo, makeAudit(), makePrisma());

      const result = await svc.markUnavailable('appt-1', 'tenant-1');

      expect(result.status).toBe('UNAVAILABLE');
      expect(repo.update).not.toHaveBeenCalled();
    });

    // O-11 (option B): "can't attend" can be the tenant's first response with no
    // cycle yet — create it already UNAVAILABLE instead of throwing.
    it('creates an UNAVAILABLE cycle when no active cycle exists (O-11 B)', async () => {
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(null);
      const prisma = makePrisma('PENDING');
      const svc = new ConfirmationCycleService(repo, makeAudit(), prisma);

      const result = await svc.markUnavailable('appt-1', 'tenant-1');

      expect(result.status).toBe('UNAVAILABLE');
      expect(repo.save).toHaveBeenCalledOnce();
    });
  });

  // O-11 (option C): a portal-link operation that changes the appointment's
  // confirmation status writes an audit ON THE APPOINTMENT (entityId = appointment)
  // with before/after, the operator and the cause, so the web timeline shows it.
  describe('appointment-level reset audit (O-11 C)', () => {
    it('records PORTAL_LINK_GENERATED when createInitial re-opens a non-CONFIRMED status', async () => {
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(null);
      const audit = makeAudit();
      const svc = new ConfirmationCycleService(repo, audit, makePrisma('UNAVAILABLE'));

      await svc.createInitial(
        'appt-1', 'tenant-1', new Date('2026-06-01'), '09:00-10:00', 'token-1',
        undefined, undefined, { actorId: 'op-1', cause: 'PORTAL_LINK_GENERATED' },
      );

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'appointment.rental_tenant_confirmation_reset',
          entityType: 'Appointment',
          entityId: 'appt-1',
          actorId: 'op-1',
          before: { rentalTenantConfirmationStatus: 'UNAVAILABLE' },
          after: { rentalTenantConfirmationStatus: 'PENDING' },
          metadata: { cause: 'PORTAL_LINK_GENERATED' },
        }),
      );
    });

    it('does NOT record a reset when createInitial adopts a CONFIRMED appointment (no status change)', async () => {
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(null);
      const audit = makeAudit();
      const svc = new ConfirmationCycleService(repo, audit, makePrisma('CONFIRMED'));

      await svc.createInitial(
        'appt-1', 'tenant-1', new Date('2026-06-01'), '09:00-10:00', 'token-1',
        undefined, undefined, { actorId: 'op-1', cause: 'PORTAL_LINK_GENERATED' },
      );

      const resetCalls = vi.mocked(audit.log).mock.calls.filter(
        (c) => (c[0] as { action: string }).action === 'appointment.rental_tenant_confirmation_reset',
      );
      expect(resetCalls).toHaveLength(0);
    });

    it('records GROUP_PORTAL_LINK_RESEND when rotateOnDateChange resets a CONFIRMED appointment', async () => {
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(makeCycle({ status: 'CONFIRMED' }));
      const audit = makeAudit();
      const svc = new ConfirmationCycleService(repo, audit, makePrisma('CONFIRMED'));

      await svc.rotateOnDateChange(
        'appt-1', 'tenant-1', new Date('2026-07-01'), '11:00-12:00', 'DATE_CHANGED',
        undefined, undefined, { actorId: 'op-2', cause: 'GROUP_PORTAL_LINK_RESEND' },
      );

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'appointment.rental_tenant_confirmation_reset',
          entityType: 'Appointment',
          entityId: 'appt-1',
          actorId: 'op-2',
          before: { rentalTenantConfirmationStatus: 'CONFIRMED' },
          after: { rentalTenantConfirmationStatus: 'PENDING' },
          metadata: { cause: 'GROUP_PORTAL_LINK_RESEND' },
        }),
      );
    });
  });

  describe('invalidateOnReopen', () => {
    it('should supersede the active cycle and mark associated token as SUPERSEDED', async () => {
      const cycle = makeCycle({ status: 'PENDING', portalTokenId: 'token-old' });
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(cycle);
      const prisma = makePrisma();
      const svc = new ConfirmationCycleService(repo, makeAudit(), prisma);

      await svc.invalidateOnReopen('appt-1', 'tenant-1');

      expect(repo.update).toHaveBeenCalledOnce();
      const updatedCycle = vi.mocked(repo.update).mock.calls[0]![0];
      expect(updatedCycle.status).toBe('SUPERSEDED');
      expect(updatedCycle.invalidatedReason).toBe('APPOINTMENT_REOPENED');
      expect(vi.mocked(prisma.rentalTenantPortalToken.update)).toHaveBeenCalledWith({
        where: { id: 'token-old' },
        data: { status: 'SUPERSEDED' },
      });
    });

    it('should be a no-op when no active cycle exists', async () => {
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(null);
      const svc = new ConfirmationCycleService(repo, makeAudit(), makePrisma());

      await expect(svc.invalidateOnReopen('appt-1', 'tenant-1')).resolves.toBeUndefined();
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('invalidateOnReject', () => {
    it('should supersede the active cycle and mark associated token as SUPERSEDED', async () => {
      const cycle = makeCycle({ status: 'PENDING', portalTokenId: 'token-old' });
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(cycle);
      const prisma = makePrisma();
      const svc = new ConfirmationCycleService(repo, makeAudit(), prisma);

      await svc.invalidateOnReject('appt-1', 'tenant-1');

      expect(repo.update).toHaveBeenCalledOnce();
      const updatedCycle = vi.mocked(repo.update).mock.calls[0]![0];
      expect(updatedCycle.status).toBe('SUPERSEDED');
      expect(vi.mocked(prisma.rentalTenantPortalToken.update)).toHaveBeenCalledWith({
        where: { id: 'token-old' },
        data: { status: 'SUPERSEDED' },
      });
    });
  });
});
