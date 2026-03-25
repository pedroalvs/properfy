import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotifyStuckInspectionsWorker } from '../../../src/modules/inspector-execution/infrastructure/workers/notify-stuck.worker';

describe('NotifyStuckInspectionsWorker', () => {
  const executionRepo = {
    findByAppointmentId: vi.fn(),
    findByAppointmentIds: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    findStuckExecutions: vi.fn(),
  };

  const appointmentRepo = {
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    saveContact: vi.fn(),
    updateContact: vi.fn(),
    saveRestriction: vi.fn(),
    deleteRestrictionsByAppointmentId: vi.fn(),
    findScheduledOnDate: vi.fn(),
    findAllContacts: vi.fn(),
    countContacts: vi.fn(),
    findContactById: vi.fn(),
    findDuplicateForImport: vi.fn(),
  };

  const createNotificationUseCase = {
    execute: vi.fn(),
  };

  const logger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  function makeWorker() {
    return new NotifyStuckInspectionsWorker(
      executionRepo as any,
      appointmentRepo as any,
      createNotificationUseCase as any,
      logger as any,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the appointment tenant when creating stuck inspection alerts', async () => {
    executionRepo.findStuckExecutions.mockResolvedValue([
      {
        appointmentId: 'appt-1',
        inspectorId: 'insp-1',
        startedAt: new Date('2026-03-24T00:00:00Z'),
      },
    ]);
    appointmentRepo.findById.mockResolvedValue({
      appointment: {
        tenantId: 'tenant-1',
      },
    });
    createNotificationUseCase.execute.mockResolvedValue({ notificationId: 'notif-1' });

    const worker = makeWorker();
    const result = await worker.execute();

    expect(createNotificationUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        appointmentId: 'appt-1',
        templateCode: 'INSPECTION_STUCK_ALERT',
      }),
    );
    expect(result).toEqual({ notifiedCount: 1 });
  });

  it('skips notifications when the appointment cannot be resolved', async () => {
    executionRepo.findStuckExecutions.mockResolvedValue([
      {
        appointmentId: 'appt-missing',
        inspectorId: 'insp-1',
        startedAt: new Date('2026-03-24T00:00:00Z'),
      },
    ]);
    appointmentRepo.findById.mockResolvedValue(null);

    const worker = makeWorker();
    const result = await worker.execute();

    expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      { appointmentId: 'appt-missing' },
      'Skipping stuck inspection alert because appointment was not found',
    );
    expect(result).toEqual({ notifiedCount: 0 });
  });
});
