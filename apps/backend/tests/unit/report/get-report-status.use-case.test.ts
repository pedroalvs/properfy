import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetReportStatusUseCase } from '../../../src/modules/report/application/use-cases/get-report-status.use-case';
import type { AuthContext } from '../../../src/modules/report/application/use-cases/get-report-status.use-case';
import type { IReportRepository } from '../../../src/modules/report/domain/report.repository';
import { ReportEntity } from '../../../src/modules/report/domain/report.entity';
import type { ReportProps } from '../../../src/modules/report/domain/report.entity';
import { ReportNotFoundError } from '../../../src/modules/report/domain/report.errors';

function makeReport(overrides: Partial<ReportProps> = {}): ReportEntity {
  return new ReportEntity({
    id: 'report-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_DONE',
    filtersJson: { fromDate: '2026-03-01', toDate: '2026-03-15' },
    format: 'XLSX',
    status: 'READY',
    fileKey: 'reports/tenant-1/INSPECTIONS_DONE/report-1.xlsx',
    requestedByUserId: 'user-1',
    startedAt: new Date('2026-03-16T07:00:02Z'),
    completedAt: new Date('2026-03-16T07:00:45Z'),
    failedAt: null,
    errorMessage: null,
    rowCount: 42,
    expiresAt: new Date('2026-04-15T07:00:45Z'),
    createdAt: new Date('2026-03-16T07:00:00Z'),
    updatedAt: new Date('2026-03-16T07:00:45Z'),
    ...overrides,
  } as ReportProps);
}

function makeMockRepo(): IReportRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    countByUserAndStatuses: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };
}

describe('GetReportStatusUseCase', () => {
  let useCase: GetReportStatusUseCase;
  let repo: IReportRepository;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new GetReportStatusUseCase(repo);
  });

  it('AM can access any report and receives errorMessage', async () => {
    const report = makeReport({ errorMessage: 'some internal error', status: 'FAILED' as any });
    vi.mocked(repo.findById).mockResolvedValue(report);

    const auth: AuthContext = { userId: 'admin-user', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
    const result = await useCase.execute('report-1', auth);

    expect(result.id).toBe('report-1');
    expect(result.reportType).toBe('INSPECTIONS_DONE');
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toBe('some internal error');
    expect(repo.findById).toHaveBeenCalledWith('report-1');
  });

  it('OP can access any report and receives errorMessage', async () => {
    const report = makeReport({ errorMessage: 'timeout', status: 'FAILED' as any });
    vi.mocked(repo.findById).mockResolvedValue(report);

    const auth: AuthContext = { userId: 'op-user', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
    const result = await useCase.execute('report-1', auth);

    expect(result.id).toBe('report-1');
    expect(result.errorMessage).toBe('timeout');
  });

  it('CL_ADMIN can access own report but errorMessage is null', async () => {
    const report = makeReport({ requestedByUserId: 'cl-admin-1' });
    vi.mocked(repo.findById).mockResolvedValue(report);

    const auth: AuthContext = { userId: 'cl-admin-1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };
    const result = await useCase.execute('report-1', auth);

    expect(result.id).toBe('report-1');
    expect(result.requestedByUserId).toBe('cl-admin-1');
    expect(result.errorMessage).toBeNull();
  });

  it('CL_ADMIN accessing another user report throws ReportNotFoundError', async () => {
    const report = makeReport({ requestedByUserId: 'other-user' });
    vi.mocked(repo.findById).mockResolvedValue(report);

    const auth: AuthContext = { userId: 'cl-admin-1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };

    await expect(useCase.execute('report-1', auth)).rejects.toThrow(ReportNotFoundError);
  });

  it('throws ReportNotFoundError when report does not exist', async () => {
    vi.mocked(repo.findById).mockResolvedValue(null);

    const auth: AuthContext = { userId: 'user-1', tenantId: 'tenant-1', role: 'AM', branchId: null, inspectorId: null };

    await expect(useCase.execute('nonexistent', auth)).rejects.toThrow(ReportNotFoundError);
  });

  it('FAILED report shows errorMessage for AM but null for CL_ADMIN', async () => {
    const report = makeReport({
      requestedByUserId: 'cl-admin-1',
      status: 'FAILED' as any,
      errorMessage: 'DB connection lost',
    });

    // AM sees the error
    vi.mocked(repo.findById).mockResolvedValue(report);
    const amAuth: AuthContext = { userId: 'admin-user', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
    const amResult = await useCase.execute('report-1', amAuth);
    expect(amResult.errorMessage).toBe('DB connection lost');

    // CL_ADMIN (owner) does not see the error
    const clAuth: AuthContext = { userId: 'cl-admin-1', tenantId: 'tenant-1', role: 'CL_ADMIN', branchId: null, inspectorId: null };
    const clResult = await useCase.execute('report-1', clAuth);
    expect(clResult.errorMessage).toBeNull();
  });

  it('returns all expected fields from the report', async () => {
    const report = makeReport();
    vi.mocked(repo.findById).mockResolvedValue(report);

    const auth: AuthContext = { userId: 'admin-user', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
    const result = await useCase.execute('report-1', auth);

    expect(result).toEqual({
      id: 'report-1',
      reportType: 'INSPECTIONS_DONE',
      status: 'READY',
      format: 'XLSX',
      filters: { fromDate: '2026-03-01', toDate: '2026-03-15' },
      rowCount: 42,
      requestedByUserId: 'user-1',
      createdAt: new Date('2026-03-16T07:00:00Z'),
      startedAt: new Date('2026-03-16T07:00:02Z'),
      completedAt: new Date('2026-03-16T07:00:45Z'),
      failedAt: null,
      expiresAt: new Date('2026-04-15T07:00:45Z'),
      errorMessage: null,
    });
  });
});
