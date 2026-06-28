import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateScheduledReportUseCase } from '../../../src/modules/report/application/use-cases/update-scheduled-report.use-case';
import type { IScheduledReportRepository } from '../../../src/modules/report/domain/scheduled-report.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { ScheduledReportEntity } from '../../../src/modules/report/domain/scheduled-report.entity';
import type { ScheduledReportProps } from '../../../src/modules/report/domain/scheduled-report.entity';
import {
  ScheduleForbiddenError,
  ScheduledReportNotFoundError,
  InvalidRecurrenceError,
} from '../../../src/modules/report/domain/report.errors';
import type { AuthContext } from '@properfy/shared';

function makeSchedule(overrides: Partial<ScheduledReportProps> = {}): ScheduledReportEntity {
  return new ScheduledReportEntity({
    id: 'sched-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: { tenantId: 'tenant-1' },
    format: 'XLSX',
    cronExpression: '0 8 * * 1',
    displayName: 'Weekly Report',
    deliveryMode: 'OWNER_ONLY',
    recipientUserIds: [],
    skipDeliveryWhenEmpty: false,
    consecutiveFailureCount: 0,
    status: 'ACTIVE',
    deletedAt: null,
    lastRunAt: null,
    nextRunAt: new Date('2026-05-01T08:00:00Z'),
    createdByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeSut() {
  const scheduleRepo: IScheduledReportRepository = {
    findById: vi.fn(),
    findByIdIncludingDeleted: vi.fn(),
    findDueForProcessing: vi.fn().mockResolvedValue([]),
    findDueSchedules: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    countActiveByOwner: vi.fn().mockResolvedValue(0),
    save: vi.fn(),
    update: vi.fn(),
  };
  const auditService: AuditService = { log: vi.fn() };
  const useCase = new UpdateScheduledReportUseCase(scheduleRepo, auditService);
  return { scheduleRepo, auditService, useCase };
}

function makeAuth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    clUserPermissions: [],
    ...overrides,
  };
}

describe('UpdateScheduledReportUseCase', () => {
  let scheduleRepo: IScheduledReportRepository;
  let auditService: AuditService;
  let useCase: UpdateScheduledReportUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    scheduleRepo = sut.scheduleRepo;
    auditService = sut.auditService;
    useCase = sut.useCase;
  });

  it('updates displayName and persists', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const result = await useCase.execute({ id: 'sched-1', displayName: 'New Name' }, makeAuth());

    expect(result.displayName).toBe('New Name');
    expect(scheduleRepo.update).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'New Name' }));
  });

  it('updates filtersJson', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const newFilters = { tenantId: 'tenant-1', status: 'DONE' };
    const result = await useCase.execute({ id: 'sched-1', filtersJson: newFilters }, makeAuth());

    expect(result.filtersJson).toEqual(newFilters);
  });

  it('updates deliveryMode and recipientUserIds', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const result = await useCase.execute(
      { id: 'sched-1', deliveryMode: 'SPECIFIC_USERS', recipientUserIds: ['u-2', 'u-3'] },
      makeAuth(),
    );

    expect(result.deliveryMode).toBe('SPECIFIC_USERS');
    expect(result.recipientUserIds).toEqual(['u-2', 'u-3']);
  });

  it('recomputes nextRunAt when recurrence changes', async () => {
    const schedule = makeSchedule({ nextRunAt: new Date('2026-04-01T00:00:00Z') });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const result = await useCase.execute(
      { id: 'sched-1', recurrence: { type: 'daily', hour: 10 } },
      makeAuth(),
    );

    expect(result.nextRunAt).not.toBeNull();
    expect(result.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('emits audit log with before/after snapshots', async () => {
    const schedule = makeSchedule();
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    await useCase.execute({ id: 'sched-1', displayName: 'Updated' }, makeAuth());

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'scheduledReportUpdated',
        entityType: 'ScheduledReport',
        entityId: 'sched-1',
        before: expect.objectContaining({ displayName: 'Weekly Report' }),
        after: expect.objectContaining({ displayName: 'Updated' }),
      }),
    );
  });

  it('throws ScheduledReportNotFoundError when schedule does not exist', async () => {
    vi.mocked(scheduleRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute({ id: 'missing' }, makeAuth())).rejects.toThrow(ScheduledReportNotFoundError);
  });

  // --- RBAC ---

  it('AM can update any schedule', async () => {
    const schedule = makeSchedule({ tenantId: 'other-tenant', createdByUserId: 'other-user' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    await expect(useCase.execute({ id: 'sched-1', displayName: 'X' }, makeAuth())).resolves.toBeDefined();
  });

  it('OP can update within own tenant', async () => {
    const schedule = makeSchedule({ tenantId: 'tenant-1', createdByUserId: 'other-user' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const auth = makeAuth({ role: 'OP', tenantId: 'tenant-1' });
    await expect(useCase.execute({ id: 'sched-1', displayName: 'X' }, auth)).resolves.toBeDefined();
  });

  it('OP cannot update cross-tenant', async () => {
    const schedule = makeSchedule({ tenantId: 'tenant-2' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const auth = makeAuth({ role: 'OP', tenantId: 'tenant-1' });
    await expect(useCase.execute({ id: 'sched-1', displayName: 'X' }, auth)).rejects.toThrow(ScheduleForbiddenError);
  });

  it('CL_ADMIN can update within own tenant', async () => {
    const schedule = makeSchedule({ tenantId: 'tenant-1', createdByUserId: 'other-user' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const auth = makeAuth({ role: 'CL_ADMIN', tenantId: 'tenant-1' });
    await expect(useCase.execute({ id: 'sched-1', displayName: 'X' }, auth)).resolves.toBeDefined();
  });

  it('CL_USER can update own schedule', async () => {
    const schedule = makeSchedule({ tenantId: 'tenant-1', createdByUserId: 'cl-user-1' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const auth = makeAuth({ userId: 'cl-user-1', role: 'CL_USER', tenantId: 'tenant-1' });
    await expect(useCase.execute({ id: 'sched-1', displayName: 'X' }, auth)).resolves.toBeDefined();
  });

  it('CL_USER cannot update another user schedule', async () => {
    const schedule = makeSchedule({ tenantId: 'tenant-1', createdByUserId: 'other-user' });
    vi.mocked(scheduleRepo.findById).mockResolvedValue(schedule);

    const auth = makeAuth({ userId: 'cl-user-1', role: 'CL_USER', tenantId: 'tenant-1' });
    await expect(useCase.execute({ id: 'sched-1', displayName: 'X' }, auth)).rejects.toThrow(ScheduleForbiddenError);
  });
});
