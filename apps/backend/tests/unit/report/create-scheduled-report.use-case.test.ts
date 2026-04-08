import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateScheduledReportUseCase } from '../../../src/modules/report/application/use-cases/create-scheduled-report.use-case';
import type { IScheduledReportRepository } from '../../../src/modules/report/domain/scheduled-report.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import {
  InvalidCronExpressionError,
  InvalidReportTypeError,
  ReportTenantScopeViolationError,
} from '../../../src/modules/report/domain/report.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { AuthContext } from '@properfy/shared';
import type { CreateScheduledReportInput } from '../../../src/modules/report/application/use-cases/create-scheduled-report.use-case';

function makeSut() {
  const scheduledReportRepo: IScheduledReportRepository = {
    findById: vi.fn(),
    findDueSchedules: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    save: vi.fn(),
    update: vi.fn(),
  };

  const auditService: AuditService = {
    log: vi.fn(),
  };

  const useCase = new CreateScheduledReportUseCase(scheduledReportRepo, auditService);
  return { scheduledReportRepo, auditService, useCase };
}

function makeInput(overrides: Partial<CreateScheduledReportInput> = {}): CreateScheduledReportInput {
  return {
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: { tenantId: 'tenant-1' },
    format: 'XLSX',
    cronExpression: '0 8 * * 1',
    deliveryEmail: 'reports@example.com',
    ...overrides,
  };
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

describe('CreateScheduledReportUseCase', () => {
  let scheduledReportRepo: IScheduledReportRepository;
  let auditService: AuditService;
  let useCase: CreateScheduledReportUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    scheduledReportRepo = sut.scheduledReportRepo;
    auditService = sut.auditService;
    useCase = sut.useCase;
  });

  it('should create a scheduled report for AM', async () => {
    const input = makeInput();
    const auth = makeAuth();

    const result = await useCase.execute(input, auth);

    expect(result.id).toBeDefined();
    expect(result.reportType).toBe('INSPECTIONS_SCHEDULED');
    expect(result.cronExpression).toBe('0 8 * * 1');
    expect(result.deliveryEmail).toBe('reports@example.com');
    expect(result.isActive).toBe(true);
    expect(result.nextRunAt).not.toBeNull();
    expect(result.createdAt).toBeInstanceOf(Date);

    expect(scheduledReportRepo.save).toHaveBeenCalledOnce();
  });

  it('should create a scheduled report for OP', async () => {
    const input = makeInput({ filtersJson: {} });
    const auth = makeAuth({ role: 'OP', tenantId: 'tenant-1' });

    const result = await useCase.execute(input, auth);

    expect(result.isActive).toBe(true);
    expect(scheduledReportRepo.save).toHaveBeenCalledOnce();
  });

  it('should reject CL_ADMIN', async () => {
    const input = makeInput();
    const auth = makeAuth({ role: 'CL_ADMIN', tenantId: 'tenant-1' });

    await expect(useCase.execute(input, auth)).rejects.toThrow(ForbiddenError);
  });

  it('should reject CL_USER', async () => {
    const input = makeInput();
    const auth = makeAuth({ role: 'CL_USER', tenantId: 'tenant-1' });

    await expect(useCase.execute(input, auth)).rejects.toThrow(ForbiddenError);
  });

  it('should reject INSP', async () => {
    const input = makeInput();
    const auth = makeAuth({ role: 'INSP' });

    await expect(useCase.execute(input, auth)).rejects.toThrow(ForbiddenError);
  });

  it('should reject invalid cron expression', async () => {
    const input = makeInput({ cronExpression: 'not a cron' });
    const auth = makeAuth();

    await expect(useCase.execute(input, auth)).rejects.toThrow(InvalidCronExpressionError);
  });

  it('should reject invalid report type', async () => {
    const input = makeInput({ reportType: 'INVALID_TYPE' as any });
    const auth = makeAuth();

    await expect(useCase.execute(input, auth)).rejects.toThrow(InvalidReportTypeError);
  });

  it('should require tenant context for AM without filter tenantId', async () => {
    const input = makeInput({ filtersJson: {} });
    const auth = makeAuth({ role: 'AM', tenantId: null });

    await expect(useCase.execute(input, auth)).rejects.toThrow(ForbiddenError);
  });

  it('should use filter tenantId for AM', async () => {
    const input = makeInput({ filtersJson: { tenantId: 'tenant-42' } });
    const auth = makeAuth({ role: 'AM', tenantId: null });

    const result = await useCase.execute(input, auth);

    expect(scheduledReportRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-42' }),
    );
    expect(result.id).toBeDefined();
  });

  it('should reject OP specifying a different tenant from their JWT', async () => {
    const input = makeInput({ filtersJson: { tenantId: 'other-tenant' } });
    const auth = makeAuth({ role: 'OP', tenantId: 'tenant-1' });

    await expect(useCase.execute(input, auth)).rejects.toThrow(ReportTenantScopeViolationError);
  });

  it('should write audit log', async () => {
    const input = makeInput();
    const auth = makeAuth();

    const result = await useCase.execute(input, auth);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'USER',
        actorId: 'user-1',
        entityType: 'ScheduledReport',
        entityId: result.id,
        action: 'scheduledReportCreated',
      }),
    );
  });

  it('should compute nextRunAt based on cron expression', async () => {
    const input = makeInput({ cronExpression: '0 0 1 * *' }); // Monthly
    const auth = makeAuth();

    const result = await useCase.execute(input, auth);

    expect(result.nextRunAt).not.toBeNull();
    expect(result.nextRunAt!.getDate()).toBe(1);
  });
});
