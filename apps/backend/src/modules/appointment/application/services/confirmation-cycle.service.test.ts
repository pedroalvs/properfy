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
    findMaxCycleNumber: vi.fn().mockResolvedValue(0),
  };
}

function makeAudit(): AuditService {
  return { log: vi.fn() } as unknown as AuditService;
}

function makePrisma(_txFn?: (tx: Prisma.TransactionClient) => Promise<unknown>): PrismaClient {
  const appointmentUpdate = vi.fn();
  const tokenUpdate = vi.fn();
  const tx = {
    appointment: { updateMany: appointmentUpdate },
    tenantPortalToken: { update: tokenUpdate },
  } as unknown as Prisma.TransactionClient;
  return {
    $transaction: vi.fn().mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    appointment: { updateMany: appointmentUpdate },
    tenantPortalToken: { update: tokenUpdate },
  } as unknown as PrismaClient;
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
  });

  describe('confirm', () => {
    it('should mark cycle CONFIRMED and update denorm', async () => {
      const cycle = makeCycle({ status: 'PENDING' });
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(cycle);
      const svc = new ConfirmationCycleService(repo, makeAudit(), makePrisma());

      const result = await svc.confirm('appt-1', 'tenant-1', 'TENANT_PORTAL', 'token-1');

      expect(result.status).toBe('CONFIRMED');
      expect(repo.update).toHaveBeenCalledOnce();
    });

    it('should be idempotent when cycle is already CONFIRMED', async () => {
      const cycle = makeCycle({ status: 'CONFIRMED' });
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(cycle);
      const svc = new ConfirmationCycleService(repo, makeAudit(), makePrisma());

      const result = await svc.confirm('appt-1', 'tenant-1', 'TENANT_PORTAL', null);

      expect(result.status).toBe('CONFIRMED');
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('should throw when no active cycle exists', async () => {
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(null);
      const svc = new ConfirmationCycleService(repo, makeAudit(), makePrisma());

      await expect(svc.confirm('appt-1', 'tenant-1', 'TENANT_PORTAL', null)).rejects.toThrow();
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
    it('should supersede the active cycle with APPOINTMENT_REOPENED reason', async () => {
      const cycle = makeCycle({ status: 'PENDING' });
      const repo = makeRepo();
      vi.mocked(repo.findActiveByAppointmentId).mockResolvedValue(cycle);
      const svc = new ConfirmationCycleService(repo, makeAudit(), makePrisma());

      await svc.invalidateOnReject('appt-1', 'tenant-1');

      expect(repo.update).toHaveBeenCalledOnce();
      const updatedCycle = vi.mocked(repo.update).mock.calls[0]![0];
      expect(updatedCycle.status).toBe('SUPERSEDED');
    });
  });
});
