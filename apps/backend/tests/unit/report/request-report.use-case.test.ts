import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestReportUseCase } from '../../../src/modules/report/application/use-cases/request-report.use-case';
import type { IReportRepository } from '../../../src/modules/report/domain/report.repository';
import type { IJobQueue } from '../../../src/modules/report/domain/job-queue';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import {
  ReportForbiddenError,
  ReportDateRangeExceededError,
  ReportConcurrentLimitExceededError,
} from '../../../src/modules/report/domain/report.errors';
import type { AuthContext, RequestReportInput } from '@properfy/shared';

function makeSut() {
  const reportRepo: IReportRepository = {
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    countByUserAndStatuses: vi.fn().mockResolvedValue(0),
    findExpiredWithFileKey: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    update: vi.fn(),
  };
  const jobQueue: IJobQueue = { enqueue: vi.fn() };
  const auditService: AuditService = { log: vi.fn() };
  const useCase = new RequestReportUseCase(reportRepo, jobQueue, auditService);
  return { reportRepo, jobQueue, auditService, useCase };
}

function makeInput(overrides: Partial<RequestReportInput> = {}): RequestReportInput {
  return {
    reportType: 'APPOINTMENTS',
    filters: {
      fromDate: '2026-01-01',
      toDate: '2026-03-01',
      dateAxis: 'SCHEDULED',
      groupProperties: false,
      ...(overrides.filters ?? {}),
    },
    ...(overrides.reportType ? { reportType: overrides.reportType } : {}),
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

  it('creates a PENDING report with filtersJson (and no format)', async () => {
    const result = await useCase.execute(makeInput(), makeAuth());

    expect(result.status).toBe('PENDING');
    expect(result.reportType).toBe('APPOINTMENTS');
    expect(result.reportId).toBeDefined();
    expect(result.createdAt).toBeInstanceOf(Date);

    const saved = vi.mocked(reportRepo.save).mock.calls[0][0];
    expect(saved).toMatchObject({ status: 'PENDING', reportType: 'APPOINTMENTS', requestedByUserId: 'user-1' });
    expect(saved.filtersJson).toMatchObject({ fromDate: '2026-01-01', toDate: '2026-03-01', dateAxis: 'SCHEDULED' });
    expect(saved).not.toHaveProperty('format');
  });

  it('records the real domain field the Period ranged on', async () => {
    await useCase.execute(makeInput({ filters: { fromDate: '2026-01-01', toDate: '2026-02-01', dateAxis: 'COMPLETED', groupProperties: false } }), makeAuth());
    const saved = vi.mocked(reportRepo.save).mock.calls[0][0];
    expect(saved.filtersJson.dateAxisField).toBe('done_checked_at');
  });

  it('records effective_at as the financial date field', async () => {
    await useCase.execute(makeInput({ reportType: 'FINANCIAL' }), makeAuth());
    const saved = vi.mocked(reportRepo.save).mock.calls[0][0];
    expect(saved.filtersJson.dateAxisField).toBe('effective_at');
  });

  it('enqueues report.generate with reportId', async () => {
    const result = await useCase.execute(makeInput(), makeAuth());
    expect(jobQueue.enqueue).toHaveBeenCalledWith(
      'report.generate',
      { reportId: result.reportId },
      { retryLimit: 2, retryBackoff: true, retentionHours: 24 },
    );
  });

  it('writes an audit log entry', async () => {
    const result = await useCase.execute(makeInput(), makeAuth());
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'USER',
        actorId: 'user-1',
        entityType: 'Report',
        entityId: result.reportId,
        action: 'reportRequested',
        metadata: expect.objectContaining({ reportType: 'APPOINTMENTS' }),
      }),
    );
  });

  // --- RBAC: AM/OP only ---
  it('allows AM', async () => {
    const result = await useCase.execute(makeInput(), makeAuth({ role: 'AM' }));
    expect(result.status).toBe('PENDING');
  });

  it('allows OP', async () => {
    const result = await useCase.execute(makeInput(), makeAuth({ role: 'OP' }));
    expect(result.status).toBe('PENDING');
  });

  it.each(['CL_ADMIN', 'CL_USER', 'INSP'] as const)('forbids %s', async (role) => {
    await expect(useCase.execute(makeInput(), makeAuth({ role, tenantId: 'tenant-1' }))).rejects.toThrow(
      ReportForbiddenError,
    );
  });

  // --- Agency scope ---
  it('leaves tenantId null when AM runs cross-agency', async () => {
    await useCase.execute(makeInput(), makeAuth({ role: 'AM', tenantId: null }));
    expect(vi.mocked(reportRepo.save).mock.calls[0][0].tenantId).toBeNull();
  });

  it('scopes to the agency when a tenantId is supplied', async () => {
    await useCase.execute(
      makeInput({ filters: { fromDate: '2026-01-01', toDate: '2026-03-01', dateAxis: 'SCHEDULED', groupProperties: false, tenantId: 'tenant-42' } }),
      makeAuth({ role: 'OP', tenantId: null }),
    );
    expect(vi.mocked(reportRepo.save).mock.calls[0][0].tenantId).toBe('tenant-42');
  });

  // --- Date range ---
  it('throws when the Period exceeds the per-type max', async () => {
    const input = makeInput({ filters: { fromDate: '2025-01-01', toDate: '2026-06-01', dateAxis: 'SCHEDULED', groupProperties: false } });
    await expect(useCase.execute(input, makeAuth())).rejects.toThrow(ReportDateRangeExceededError);
  });

  it('succeeds within the max Period', async () => {
    const input = makeInput({ filters: { fromDate: '2026-01-01', toDate: '2026-06-01', dateAxis: 'SCHEDULED', groupProperties: false } });
    const result = await useCase.execute(input, makeAuth());
    expect(result.status).toBe('PENDING');
  });

  // --- Concurrency ---
  it('throws when the per-user active count reaches the limit', async () => {
    vi.mocked(reportRepo.countByUserAndStatuses).mockResolvedValue(3);
    await expect(useCase.execute(makeInput(), makeAuth())).rejects.toThrow(ReportConcurrentLimitExceededError);
  });

  it('succeeds below the per-user limit', async () => {
    vi.mocked(reportRepo.countByUserAndStatuses).mockResolvedValue(2);
    const result = await useCase.execute(makeInput(), makeAuth());
    expect(result.status).toBe('PENDING');
    expect(reportRepo.countByUserAndStatuses).toHaveBeenCalledWith('user-1', ['PENDING', 'PROCESSING']);
  });
});
