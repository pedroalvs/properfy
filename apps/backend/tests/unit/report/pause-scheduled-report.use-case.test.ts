import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PauseScheduledReportUseCase } from '../../../src/modules/report/application/use-cases/pause-scheduled-report.use-case';
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
  return { scheduleRepo, auditService, useCase: new PauseScheduledReportUseCase(scheduleRepo, auditService) };
}

const amAuth: AuthContext = { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, clUserPermissions: [] };

describe('PauseScheduledReportUseCase', () => {
  let scheduleRepo: IScheduledReportRepository;
  let auditService: AuditService;
  let useCase: PauseScheduledReportUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    scheduleRepo = sut.scheduleRepo;
    auditService = sut.auditService;
    useCase = sut.useCase;
  });

  it('transitions an ACTIVE schedule to PAUSED', async () => {
    const schedule = makeSchedule({ status: 'ACTIVE' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const result = await useCase.execute({ id: 'sched-1' }, amAuth);

    expect(result.status).toBe('PAUSED');
    expect(scheduleRepo.update).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'scheduledReportPaused' }));
  });

  it('is idempotent when already PAUSED', async () => {
    const schedule = makeSchedule({ status: 'PAUSED' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const result = await useCase.execute({ id: 'sched-1' }, amAuth);

    expect(result.status).toBe('PAUSED');
    expect(scheduleRepo.update).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('includes optional reason in audit', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    await useCase.execute({ id: 'sched-1', reason: 'Maintenance window' }, amAuth);

    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ reason: 'Maintenance window' }));
  });

  it('throws ScheduledReportNotFoundError for missing schedule', async () => {
    vi.mocked(scheduleRepo.findById).mockResolvedValue(null);
    await expect(useCase.execute({ id: 'missing' }, amAuth)).rejects.toThrow(ScheduledReportNotFoundError);
  });

  it('CL_USER cannot pause another user schedule', async () => {
    const schedule = makeSchedule({ tenantId: 'tenant-1', createdByUserId: 'other' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);
    const auth: AuthContext = { ...amAuth, userId: 'cl-user-1', role: 'CL_USER', tenantId: 'tenant-1' };
    await expect(useCase.execute({ id: 'sched-1' }, auth)).rejects.toThrow(ScheduleForbiddenError);
  });
});
