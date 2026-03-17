import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestReportUseCase } from '../../../src/modules/report/application/use-cases/request-report.use-case';
import type { IReportRepository } from '../../../src/modules/report/domain/report.repository';
import type { IJobQueue } from '../../../src/modules/report/domain/job-queue';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { ReportEntity } from '../../../src/modules/report/domain/report.entity';
import {
  ReportTypeForbiddenError,
  ReportTenantScopeViolationError,
  ReportDateRangeExceededError,
  ReportConcurrentLimitExceededError,
} from '../../../src/modules/report/domain/report.errors';
import type { RequestReportInput, AuthContext } from '../../../src/modules/report/application/use-cases/request-report.use-case';

function makeSut() {
  const reportRepo: IReportRepository = {
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    countByUserAndStatuses: vi.fn().mockResolvedValue(0),
    save: vi.fn(),
    update: vi.fn(),
  };

  const jobQueue: IJobQueue = {
    enqueue: vi.fn(),
  };

  const auditService: AuditService = {
    log: vi.fn(),
  };

  const useCase = new RequestReportUseCase(reportRepo, jobQueue, auditService);
  return { reportRepo, jobQueue, auditService, useCase };
}

function makeInput(overrides: Partial<RequestReportInput> = {}): RequestReportInput {
  return {
    reportType: 'INSPECTIONS_SCHEDULED',
    filters: {
      fromDate: '2026-01-01',
      toDate: '2026-03-01',
    },
    format: 'XLSX',
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
    ...overrides,
  };
}

describe('RequestReportUseCase', () => {
  let reportRepo: IReportRepository;
  let jobQueue: IJobQueue;
  let auditService: AuditService;
  let useCase: RequestReportUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    reportRepo = sut.reportRepo;
    jobQueue = sut.jobQueue;
    auditService = sut.auditService;
    useCase = sut.useCase;
  });

  it('should create a report with PENDING status and correct filtersJson', async () => {
    const input = makeInput();
    const auth = makeAuth();

    const result = await useCase.execute(input, auth);

    expect(result.status).toBe('PENDING');
    expect(result.reportType).toBe('INSPECTIONS_SCHEDULED');
    expect(result.reportId).toBeDefined();
    expect(result.createdAt).toBeInstanceOf(Date);

    expect(reportRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PENDING',
        reportType: 'INSPECTIONS_SCHEDULED',
        format: 'XLSX',
        filtersJson: expect.objectContaining({
          fromDate: '2026-01-01',
          toDate: '2026-03-01',
        }),
        requestedByUserId: 'user-1',
      }),
    );
  });

  it('should enqueue report.generate job with reportId', async () => {
    const result = await useCase.execute(makeInput(), makeAuth());

    expect(jobQueue.enqueue).toHaveBeenCalledWith(
      'report.generate',
      { reportId: result.reportId },
      { retryLimit: 2, retryBackoff: true, retentionHours: 24 },
    );
  });

  it('should write audit log entry', async () => {
    const result = await useCase.execute(makeInput(), makeAuth());

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'USER',
        actorId: 'user-1',
        entityType: 'Report',
        entityId: result.reportId,
        action: 'reportRequested',
        metadata: expect.objectContaining({
          reportType: 'INSPECTIONS_SCHEDULED',
          format: 'XLSX',
        }),
      }),
    );
  });

  // --- Restricted report type tests ---

  it('should throw ReportTypeForbiddenError when CL_ADMIN requests INSPECTOR_PERFORMANCE', async () => {
    const input = makeInput({ reportType: 'INSPECTOR_PERFORMANCE' });
    const auth = makeAuth({ role: 'CL_ADMIN', tenantId: 'tenant-1' });

    await expect(useCase.execute(input, auth)).rejects.toThrow(ReportTypeForbiddenError);
  });

  it('should throw ReportTypeForbiddenError when CL_ADMIN requests CONFIRMATION_STATUS', async () => {
    const input = makeInput({ reportType: 'CONFIRMATION_STATUS' });
    const auth = makeAuth({ role: 'CL_ADMIN', tenantId: 'tenant-1' });

    await expect(useCase.execute(input, auth)).rejects.toThrow(ReportTypeForbiddenError);
  });

  it('should throw ReportTypeForbiddenError when CL_ADMIN requests FINANCIAL_SERVICES', async () => {
    const input = makeInput({ reportType: 'FINANCIAL_SERVICES' });
    const auth = makeAuth({ role: 'CL_ADMIN', tenantId: 'tenant-1' });

    await expect(useCase.execute(input, auth)).rejects.toThrow(ReportTypeForbiddenError);
  });

  it('should allow AM to request restricted report type', async () => {
    const input = makeInput({ reportType: 'INSPECTOR_PERFORMANCE' });
    const auth = makeAuth({ role: 'AM' });

    const result = await useCase.execute(input, auth);

    expect(result.reportType).toBe('INSPECTOR_PERFORMANCE');
    expect(result.status).toBe('PENDING');
  });

  it('should allow OP to request restricted report type', async () => {
    const input = makeInput({ reportType: 'FINANCIAL_SERVICES' });
    const auth = makeAuth({ role: 'OP' });

    const result = await useCase.execute(input, auth);

    expect(result.reportType).toBe('FINANCIAL_SERVICES');
    expect(result.status).toBe('PENDING');
  });

  // --- Tenant scope tests ---

  it('should throw ReportTenantScopeViolationError when CL_ADMIN filters by another tenant', async () => {
    const input = makeInput({
      filters: { fromDate: '2026-01-01', toDate: '2026-03-01', tenantId: 'other-tenant' },
    });
    const auth = makeAuth({ role: 'CL_ADMIN', tenantId: 'tenant-1' });

    await expect(useCase.execute(input, auth)).rejects.toThrow(ReportTenantScopeViolationError);
  });

  it('should use JWT tenantId when CL_ADMIN omits filter tenantId', async () => {
    const input = makeInput();
    const auth = makeAuth({ role: 'CL_ADMIN', tenantId: 'tenant-1' });

    await useCase.execute(input, auth);

    expect(reportRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
      }),
    );
  });

  it('should set tenantId to null when AM omits filter tenantId (platform-wide)', async () => {
    const input = makeInput();
    const auth = makeAuth({ role: 'AM', tenantId: null });

    await useCase.execute(input, auth);

    expect(reportRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: null,
      }),
    );
  });

  it('should use provided tenantId when AM specifies it', async () => {
    const input = makeInput({
      filters: { fromDate: '2026-01-01', toDate: '2026-03-01', tenantId: 'tenant-42' },
    });
    const auth = makeAuth({ role: 'AM', tenantId: null });

    await useCase.execute(input, auth);

    expect(reportRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-42',
      }),
    );
  });

  // --- Date range tests ---

  it('should throw ReportDateRangeExceededError when date range exceeds max months', async () => {
    const input = makeInput({
      reportType: 'INSPECTIONS_SCHEDULED',
      filters: { fromDate: '2025-01-01', toDate: '2026-06-01' },
    });
    const auth = makeAuth();

    await expect(useCase.execute(input, auth)).rejects.toThrow(ReportDateRangeExceededError);
  });

  it('should succeed when date range is within max months', async () => {
    const input = makeInput({
      reportType: 'INSPECTIONS_SCHEDULED',
      filters: { fromDate: '2026-01-01', toDate: '2026-06-01' },
    });
    const auth = makeAuth();

    const result = await useCase.execute(input, auth);

    expect(result.status).toBe('PENDING');
  });

  it('should enforce 6-month max for CONFIRMATION_STATUS specifically', async () => {
    // 7 months exceeds 6-month limit
    const input = makeInput({
      reportType: 'CONFIRMATION_STATUS',
      filters: { fromDate: '2026-01-01', toDate: '2026-08-02' },
    });
    const auth = makeAuth();

    await expect(useCase.execute(input, auth)).rejects.toThrow(ReportDateRangeExceededError);
  });

  it('should allow CONFIRMATION_STATUS within 6-month range', async () => {
    const input = makeInput({
      reportType: 'CONFIRMATION_STATUS',
      filters: { fromDate: '2026-01-01', toDate: '2026-07-01' },
    });
    const auth = makeAuth();

    const result = await useCase.execute(input, auth);

    expect(result.status).toBe('PENDING');
  });

  // --- Concurrent limit tests ---

  it('should throw ReportConcurrentLimitExceededError when active count >= 3', async () => {
    vi.mocked(reportRepo.countByUserAndStatuses).mockResolvedValue(3);

    await expect(useCase.execute(makeInput(), makeAuth())).rejects.toThrow(
      ReportConcurrentLimitExceededError,
    );
  });

  it('should succeed when active count is less than 3', async () => {
    vi.mocked(reportRepo.countByUserAndStatuses).mockResolvedValue(2);

    const result = await useCase.execute(makeInput(), makeAuth());

    expect(result.status).toBe('PENDING');
    expect(reportRepo.countByUserAndStatuses).toHaveBeenCalledWith('user-1', ['PENDING', 'PROCESSING']);
  });
});
