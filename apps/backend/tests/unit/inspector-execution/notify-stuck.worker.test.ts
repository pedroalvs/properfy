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

  const notificationRepo = {
    count: vi.fn(),
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
      notificationRepo as any,
      createNotificationUseCase as any,
      logger as any,
    );
  }

  function makeStuckExecution(overrides: Record<string, unknown> = {}) {
    return {
      appointmentId: 'appt-1',
      inspectorId: 'insp-1',
      // 12h ago: past the 6h stuck threshold, well within the 7-day max age
      startedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    notificationRepo.count.mockResolvedValue(0);
  });

  it('uses the appointment tenant when creating stuck inspection alerts', async () => {
    executionRepo.findStuckExecutions.mockResolvedValue([makeStuckExecution()]);
    appointmentRepo.findById.mockResolvedValue({
      appointment: {
        tenantId: 'tenant-1',
        status: 'SCHEDULED',
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
      makeStuckExecution({ appointmentId: 'appt-missing' }),
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

  it('skips executions whose appointment is no longer SCHEDULED', async () => {
    executionRepo.findStuckExecutions.mockResolvedValue([makeStuckExecution()]);
    appointmentRepo.findById.mockResolvedValue({
      appointment: {
        tenantId: 'tenant-1',
        status: 'DONE',
      },
    });

    const worker = makeWorker();
    const result = await worker.execute();

    expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ notifiedCount: 0 });
  });

  it('skips executions that already got an alert within the cool-off window', async () => {
    executionRepo.findStuckExecutions.mockResolvedValue([makeStuckExecution()]);
    appointmentRepo.findById.mockResolvedValue({
      appointment: {
        tenantId: 'tenant-1',
        status: 'SCHEDULED',
      },
    });
    notificationRepo.count.mockResolvedValue(1);

    const worker = makeWorker();
    const result = await worker.execute();

    expect(notificationRepo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: 'appt-1',
        templateCode: 'INSPECTION_STUCK_ALERT',
        fromDate: expect.any(String),
      }),
    );
    expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ notifiedCount: 0 });
  });

  it('uses a 24h cool-off window when checking for recent alerts', async () => {
    executionRepo.findStuckExecutions.mockResolvedValue([makeStuckExecution()]);
    appointmentRepo.findById.mockResolvedValue({
      appointment: {
        tenantId: 'tenant-1',
        status: 'SCHEDULED',
      },
    });
    createNotificationUseCase.execute.mockResolvedValue({ notificationId: 'notif-1' });

    const before = Date.now();
    const worker = makeWorker();
    await worker.execute();
    const after = Date.now();

    const filters = notificationRepo.count.mock.calls[0]![0];
    const fromDate = new Date(filters.fromDate).getTime();
    expect(fromDate).toBeGreaterThanOrEqual(before - 24 * 60 * 60 * 1000);
    expect(fromDate).toBeLessThanOrEqual(after - 24 * 60 * 60 * 1000);
  });

  it('stops alerting for executions older than the max alert age', async () => {
    executionRepo.findStuckExecutions.mockResolvedValue([
      makeStuckExecution({
        startedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      }),
    ]);

    const worker = makeWorker();
    const result = await worker.execute();

    expect(appointmentRepo.findById).not.toHaveBeenCalled();
    expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ notifiedCount: 0 });
  });

  it('still alerts fresh executions when older ones are skipped', async () => {
    executionRepo.findStuckExecutions.mockResolvedValue([
      makeStuckExecution({
        appointmentId: 'appt-old',
        startedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      }),
      makeStuckExecution({ appointmentId: 'appt-fresh' }),
    ]);
    appointmentRepo.findById.mockResolvedValue({
      appointment: {
        tenantId: 'tenant-1',
        status: 'SCHEDULED',
      },
    });
    createNotificationUseCase.execute.mockResolvedValue({ notificationId: 'notif-1' });

    const worker = makeWorker();
    const result = await worker.execute();

    expect(createNotificationUseCase.execute).toHaveBeenCalledTimes(1);
    expect(createNotificationUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'appt-fresh' }),
    );
    expect(result).toEqual({ notifiedCount: 1 });
  });
});
