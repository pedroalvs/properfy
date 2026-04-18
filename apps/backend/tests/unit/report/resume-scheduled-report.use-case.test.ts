import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResumeScheduledReportUseCase } from '../../../src/modules/report/application/use-cases/resume-scheduled-report.use-case';
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
    deliveryEmail: '', displayName: null, deliveryMode: 'OWNER_ONLY',
    recipientUserIds: [], skipDeliveryWhenEmpty: false, consecutiveFailureCount: 3,
    status: 'PAUSED', deletedAt: null, isActive: false, lastRunAt: null,
    nextRunAt: null, createdByUserId: 'user-1',
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
  return { scheduleRepo, auditService, useCase: new ResumeScheduledReportUseCase(scheduleRepo, auditService) };
}

const amAuth: AuthContext = { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null, clUserPermissions: [] };

describe('ResumeScheduledReportUseCase', () => {
  let scheduleRepo: IScheduledReportRepository;
  let auditService: AuditService;
  let useCase: ResumeScheduledReportUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    scheduleRepo = sut.scheduleRepo;
    auditService = sut.auditService;
    useCase = sut.useCase;
  });

  it('transitions a PAUSED schedule to ACTIVE', async () => {
    const schedule = makeSchedule({ status: 'PAUSED' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const result = await useCase.execute('sched-1', amAuth);

    expect(result.status).toBe('ACTIVE');
    expect(scheduleRepo.update).toHaveBeenCalled();
  });

  it('resets consecutiveFailureCount to 0', async () => {
    const schedule = makeSchedule({ consecutiveFailureCount: 3 });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const result = await useCase.execute('sched-1', amAuth);

    expect(result.consecutiveFailureCount).toBe(0);
  });

  it('recomputes nextRunAt from cron expression', async () => {
    const schedule = makeSchedule({ cronExpression: '0 8 * * 1', nextRunAt: null });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const result = await useCase.execute('sched-1', amAuth);

    expect(result.nextRunAt).not.toBeNull();
    expect(result.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('is idempotent when already ACTIVE', async () => {
    const schedule = makeSchedule({ status: 'ACTIVE' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const result = await useCase.execute('sched-1', amAuth);

    expect(result.status).toBe('ACTIVE');
    expect(scheduleRepo.update).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('emits audit with before/after including counter reset', async () => {
    const schedule = makeSchedule({ consecutiveFailureCount: 3 });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    await useCase.execute('sched-1', amAuth);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'scheduledReportResumed',
        before: expect.objectContaining({ consecutiveFailureCount: 3 }),
        after: expect.objectContaining({ consecutiveFailureCount: 0 }),
      }),
    );
  });

  it('throws ScheduledReportNotFoundError for missing schedule', async () => {
    vi.mocked(scheduleRepo.findById).mockResolvedValue(null);
    await expect(useCase.execute('missing', amAuth)).rejects.toThrow(ScheduledReportNotFoundError);
  });

  it('OP cannot resume cross-tenant', async () => {
    const schedule = makeSchedule({ tenantId: 'tenant-2' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);
    const auth: AuthContext = { ...amAuth, role: 'OP', tenantId: 'tenant-1' };
    await expect(useCase.execute('sched-1', auth)).rejects.toThrow(ScheduleForbiddenError);
  });
});
