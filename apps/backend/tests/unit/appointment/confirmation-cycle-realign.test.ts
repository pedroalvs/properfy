import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmationCycleService } from '../../../src/modules/appointment/application/services/confirmation-cycle.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';

const NEW_DATE = new Date('2026-07-15');

function setup(activeCycle: unknown) {
  const cycleRepo = {
    findActiveByAppointmentId: vi.fn().mockResolvedValue(activeCycle),
    realignSchedule: vi.fn().mockResolvedValue(undefined),
    update: vi.fn(),
    save: vi.fn(),
    findById: vi.fn(),
    findMaxCycleNumber: vi.fn(),
  };
  const auditService = { log: vi.fn() } as unknown as AuditService;
  const service = new ConfirmationCycleService(cycleRepo as never, auditService, {} as never);
  return { service, cycleRepo, auditService };
}

const CONFIRMED_CYCLE = {
  id: 'cycle-1',
  status: 'CONFIRMED',
  scheduledDate: new Date('2026-06-01'),
  timeSlot: '09:00-12:00',
};

describe('ConfirmationCycleService.realignActiveCycleSchedule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moves the active cycle onto the new schedule', async () => {
    const { service, cycleRepo } = setup(CONFIRMED_CYCLE);

    await service.realignActiveCycleSchedule('appt-1', 'tenant-1', NEW_DATE, '13:00-15:00');

    expect(cycleRepo.realignSchedule).toHaveBeenCalledWith('cycle-1', NEW_DATE, '13:00-15:00', undefined);
  });

  it('never touches the status — the operator chose to keep the confirmation', async () => {
    const { service, cycleRepo } = setup(CONFIRMED_CYCLE);

    await service.realignActiveCycleSchedule('appt-1', 'tenant-1', NEW_DATE, '13:00-15:00');

    expect(cycleRepo.update).not.toHaveBeenCalled();
    expect(cycleRepo.save).not.toHaveBeenCalled();
  });

  it('audits the move with the old and new schedule', async () => {
    const { service, auditService } = setup(CONFIRMED_CYCLE);

    await service.realignActiveCycleSchedule('appt-1', 'tenant-1', NEW_DATE, '13:00-15:00');

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment_confirmation_cycle.updated',
        entityId: 'cycle-1',
        tenantId: 'tenant-1',
        before: { scheduledDate: CONFIRMED_CYCLE.scheduledDate, timeSlot: '09:00-12:00' },
        after: expect.objectContaining({ reason: 'SCHEDULE_REALIGNED' }),
      }),
    );
  });

  it('no-ops when the appointment has no active cycle', async () => {
    const { service, cycleRepo, auditService } = setup(null);

    await service.realignActiveCycleSchedule('appt-1', 'tenant-1', NEW_DATE, '13:00-15:00');

    expect(cycleRepo.realignSchedule).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });
});
