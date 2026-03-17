import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListReportsUseCase } from '../../../src/modules/report/application/use-cases/list-reports.use-case';
import type { IReportRepository } from '../../../src/modules/report/domain/report.repository';
import { ReportEntity, type ReportProps } from '../../../src/modules/report/domain/report.entity';
import type { ListReportsInput, AuthContext } from '../../../src/modules/report/application/use-cases/list-reports.use-case';

function makeReport(overrides: Partial<ReportProps> = {}): ReportEntity {
  const now = new Date('2026-03-16T10:00:00.000Z');
  const defaults: ReportProps = {
    id: 'report-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: { fromDate: '2026-01-01', toDate: '2026-03-01' },
    format: 'XLSX',
    status: 'READY',
    fileKey: 'reports/report-1.xlsx',
    requestedByUserId: 'user-1',
    startedAt: now,
    completedAt: now,
    failedAt: null,
    errorMessage: null,
    rowCount: 42,
    expiresAt: new Date('2026-04-15T10:00:00.000Z'),
    createdAt: now,
    updatedAt: now,
  };
  return new ReportEntity({ ...defaults, ...overrides });
}

function makeSut() {
  const reportRepo: IReportRepository = {
    findById: vi.fn(),
    findAll: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    countByUserAndStatuses: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };
  const useCase = new ListReportsUseCase(reportRepo);
  return { reportRepo, useCase };
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

function makeInput(overrides: Partial<ListReportsInput> = {}): ListReportsInput {
  return {
    page: 1,
    pageSize: 10,
    ...overrides,
  };
}

describe('ListReportsUseCase', () => {
  let reportRepo: IReportRepository;
  let useCase: ListReportsUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    const sut = makeSut();
    reportRepo = sut.reportRepo;
    useCase = sut.useCase;
  });

  it('should allow AM to see all reports without requestedByUserId filter', async () => {
    vi.mocked(reportRepo.findAll).mockResolvedValue([makeReport()]);
    vi.mocked(reportRepo.count).mockResolvedValue(1);

    await useCase.execute(makeInput(), makeAuth({ role: 'AM' }));

    const calledFilters = vi.mocked(reportRepo.findAll).mock.calls[0][0];
    expect(calledFilters).not.toHaveProperty('requestedByUserId');
  });

  it('should allow OP to see all reports without requestedByUserId filter', async () => {
    vi.mocked(reportRepo.findAll).mockResolvedValue([]);
    vi.mocked(reportRepo.count).mockResolvedValue(0);

    await useCase.execute(makeInput(), makeAuth({ role: 'OP' }));

    const calledFilters = vi.mocked(reportRepo.findAll).mock.calls[0][0];
    expect(calledFilters).not.toHaveProperty('requestedByUserId');
  });

  it('should scope CL_ADMIN to own reports via requestedByUserId filter', async () => {
    vi.mocked(reportRepo.findAll).mockResolvedValue([]);
    vi.mocked(reportRepo.count).mockResolvedValue(0);

    await useCase.execute(
      makeInput(),
      makeAuth({ role: 'CL_ADMIN', userId: 'cl-user-1', tenantId: 'tenant-1' }),
    );

    const calledFilters = vi.mocked(reportRepo.findAll).mock.calls[0][0];
    expect(calledFilters).toEqual(
      expect.objectContaining({
        requestedByUserId: 'cl-user-1',
        tenantId: 'tenant-1',
      }),
    );
  });

  it('should return null for errorMessage for CL_ADMIN on FAILED reports', async () => {
    const failedReport = makeReport({
      status: 'FAILED',
      errorMessage: 'Internal processing error',
      completedAt: null,
      fileKey: null,
    });
    vi.mocked(reportRepo.findAll).mockResolvedValue([failedReport]);
    vi.mocked(reportRepo.count).mockResolvedValue(1);

    const result = await useCase.execute(
      makeInput(),
      makeAuth({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    );

    expect(result.data[0].errorMessage).toBeNull();
    expect(result.data[0].status).toBe('FAILED');
  });

  it('should expose errorMessage for AM on FAILED reports', async () => {
    const failedReport = makeReport({
      status: 'FAILED',
      errorMessage: 'Internal processing error',
    });
    vi.mocked(reportRepo.findAll).mockResolvedValue([failedReport]);
    vi.mocked(reportRepo.count).mockResolvedValue(1);

    const result = await useCase.execute(makeInput(), makeAuth({ role: 'AM' }));

    expect(result.data[0].errorMessage).toBe('Internal processing error');
  });

  it('should expose errorMessage for OP on FAILED reports', async () => {
    const failedReport = makeReport({
      status: 'FAILED',
      errorMessage: 'Timeout exceeded',
    });
    vi.mocked(reportRepo.findAll).mockResolvedValue([failedReport]);
    vi.mocked(reportRepo.count).mockResolvedValue(1);

    const result = await useCase.execute(makeInput(), makeAuth({ role: 'OP' }));

    expect(result.data[0].errorMessage).toBe('Timeout exceeded');
  });

  it('should compute pagination meta correctly', async () => {
    vi.mocked(reportRepo.findAll).mockResolvedValue([makeReport()]);
    vi.mocked(reportRepo.count).mockResolvedValue(25);

    const result = await useCase.execute(makeInput({ page: 2, pageSize: 10 }), makeAuth());

    expect(result.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 25,
      totalPages: 3,
    });
  });

  it('should return totalPages as 0 when total is 0', async () => {
    vi.mocked(reportRepo.findAll).mockResolvedValue([]);
    vi.mocked(reportRepo.count).mockResolvedValue(0);

    const result = await useCase.execute(makeInput(), makeAuth());

    expect(result.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });
  });

  it('should pass reportType and status filters through to repository', async () => {
    vi.mocked(reportRepo.findAll).mockResolvedValue([]);
    vi.mocked(reportRepo.count).mockResolvedValue(0);

    await useCase.execute(
      makeInput({ reportType: 'INSPECTIONS_DONE', status: 'READY' }),
      makeAuth(),
    );

    const calledFilters = vi.mocked(reportRepo.findAll).mock.calls[0][0];
    expect(calledFilters).toEqual(
      expect.objectContaining({
        reportType: 'INSPECTIONS_DONE',
        status: 'READY',
      }),
    );
  });

  it('should pass date filters through to repository', async () => {
    vi.mocked(reportRepo.findAll).mockResolvedValue([]);
    vi.mocked(reportRepo.count).mockResolvedValue(0);

    await useCase.execute(
      makeInput({ fromDate: '2026-01-01', toDate: '2026-03-31' }),
      makeAuth(),
    );

    const calledFilters = vi.mocked(reportRepo.findAll).mock.calls[0][0];
    expect(calledFilters).toEqual(
      expect.objectContaining({
        fromDate: '2026-01-01',
        toDate: '2026-03-31',
      }),
    );
  });

  it('should map report entity fields correctly in output', async () => {
    const report = makeReport({
      id: 'report-99',
      reportType: 'INSPECTIONS_DONE',
      status: 'READY',
      format: 'XLSX',
      rowCount: 100,
      requestedByUserId: 'user-5',
    });
    vi.mocked(reportRepo.findAll).mockResolvedValue([report]);
    vi.mocked(reportRepo.count).mockResolvedValue(1);

    const result = await useCase.execute(makeInput(), makeAuth());

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'report-99',
        reportType: 'INSPECTIONS_DONE',
        status: 'READY',
        format: 'XLSX',
        rowCount: 100,
        requestedByUserId: 'user-5',
      }),
    );
  });
});
