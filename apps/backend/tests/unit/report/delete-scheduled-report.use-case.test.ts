import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteScheduledReportUseCase } from '../../../src/modules/report/application/use-cases/delete-scheduled-report.use-case';
import type { IScheduledReportRepository } from '../../../src/modules/report/domain/scheduled-report.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { ScheduledReportEntity } from '../../../src/modules/report/domain/scheduled-report.entity';
import type { ScheduledReportProps } from '../../../src/modules/report/domain/scheduled-report.entity';
import {
  ScheduleForbiddenError,
  ScheduledReportNotFoundError,
} from '../../../src/modules/report/domain/report.errors';
import type { AuthContext } from '@properfy/shared';

function makeSchedule(overrides: Partial<ScheduledReportProps> = {}): ScheduledReportEntity {
  return new ScheduledReportEntity({
    id: 'sched-1', tenantId: 'tenant-1', reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {}, format: 'XLSX', cronExpression: '0 8 * * 1',
    displayName: null, deliveryMode: 'OWNER_ONLY',
    recipientUserIds: [], skipDeliveryWhenEmpty: false, consecutiveFailureCount: 0,
    status: 'ACTIVE', deletedAt: null, lastRunAt: null,
    nextRunAt: new Date(), createdByUserId: 'user-1',
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  });
}

function makeSut() {
  const scheduleRepo: IScheduledReportRepository = {
    findById: vi.fn(), findByIdIncludingDeleted: vi.fn(),
    findDueForProcessing: vi.fn().mockResolvedValue([]),
    findDueSchedules: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0),
    countActiveByOwner: vi.fn().mockResolvedValue(0), save: vi.fn(), update: vi.fn(),
  };
  const auditService: AuditService = { log: vi.fn() };
  return { scheduleRepo, auditService, useCase: new DeleteScheduledReportUseCase(scheduleRepo, auditService) };
}

const amAuth: AuthContext = { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, clUserPermissions: [] };

describe('DeleteScheduledReportUseCase', () => {
  let scheduleRepo: IScheduledReportRepository;
  let auditService: AuditService;
  let useCase: DeleteScheduledReportUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    scheduleRepo = sut.scheduleRepo;
    auditService = sut.auditService;
    useCase = sut.useCase;
  });

  it('soft-deletes the schedule', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    await useCase.execute('sched-1', amAuth);

    expect(schedule.deletedAt).not.toBeNull();
    expect(schedule.status).toBe('PAUSED');
    expect(scheduleRepo.update).toHaveBeenCalledWith(schedule);
  });

  it('emits audit with before/after', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    await useCase.execute('sched-1', amAuth);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'scheduledReportDeleted',
        after: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });

  it('throws ScheduledReportNotFoundError for missing schedule', async () => {
    vi.mocked(scheduleRepo.findById).mockResolvedValue(null);
    await expect(useCase.execute('missing', amAuth)).rejects.toThrow(ScheduledReportNotFoundError);
  });

  it('CL_USER can delete own schedule', async () => {
    const schedule = makeSchedule({ tenantId: 'tenant-1', createdByUserId: 'cl-user-1' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);
    const auth: AuthContext = { ...amAuth, userId: 'cl-user-1', role: 'CL_USER', tenantId: 'tenant-1' };
    await expect(useCase.execute('sched-1', auth)).resolves.toBeUndefined();
  });

  it('CL_USER cannot delete another user schedule', async () => {
    const schedule = makeSchedule({ tenantId: 'tenant-1', createdByUserId: 'other' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);
    const auth: AuthContext = { ...amAuth, userId: 'cl-user-1', role: 'CL_USER', tenantId: 'tenant-1' };
    await expect(useCase.execute('sched-1', auth)).rejects.toThrow(ScheduleForbiddenError);
  });
});
