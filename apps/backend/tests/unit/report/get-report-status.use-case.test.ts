import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetReportStatusUseCase } from '../../../src/modules/report/application/use-cases/get-report-status.use-case';
import type { AuthContext } from '../../../src/modules/report/application/use-cases/get-report-status.use-case';
import type { IReportRepository } from '../../../src/modules/report/domain/report.repository';
import { ReportEntity } from '../../../src/modules/report/domain/report.entity';
import type { ReportProps } from '../../../src/modules/report/domain/report.entity';
import { ReportNotFoundError, ReportForbiddenError } from '../../../src/modules/report/domain/report.errors';

function makeReport(overrides: Partial<ReportProps> = {}): ReportEntity {
  return new ReportEntity({
    id: 'report-1',
    tenantId: 'tenant-1',
    reportType: 'APPOINTMENTS',
    filtersJson: { fromDate: '2026-03-01', toDate: '2026-03-15' },
    status: 'READY',
    fileKey: 'reports/tenant-1/APPOINTMENTS/report-1.xlsx',
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
    findExpiredWithFileKey: vi.fn().mockResolvedValue([]),
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
    expect(result.reportType).toBe('APPOINTMENTS');
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toBe('some internal error');
    expect(repo.findById).toHaveBeenCalledWith('report-1');
  });

  it('OP can access any report and receives errorMessage', async () => {
    const report = makeReport({ errorMessage: 'timeout', status: 'FAILED' as any });
    vi.mocked(repo.findById).mockResolvedValue(report);

    const auth: AuthContext = { userId: 'op-user', tenantId: null, role: 'OP', branchId: null, inspectorId: null };
    const result = await useCase.execute('report-1', auth);

    expect(result.errorMessage).toBe('timeout');
  });

  it.each(['CL_ADMIN', 'CL_USER', 'INSP'] as const)('%s is forbidden', async (role) => {
    const report = makeReport();
    vi.mocked(repo.findById).mockResolvedValue(report);

    const auth: AuthContext = { userId: 'user-1', tenantId: 'tenant-1', role, branchId: null, inspectorId: null };

    await expect(useCase.execute('report-1', auth)).rejects.toThrow(ReportForbiddenError);
  });

  it('throws ReportNotFoundError when report does not exist', async () => {
    vi.mocked(repo.findById).mockResolvedValue(null);
    const auth: AuthContext = { userId: 'user-1', tenantId: 'tenant-1', role: 'AM', branchId: null, inspectorId: null };
    await expect(useCase.execute('nonexistent', auth)).rejects.toThrow(ReportNotFoundError);
  });

  it('returns all expected fields from the report', async () => {
    const report = makeReport();
    vi.mocked(repo.findById).mockResolvedValue(report);

    const auth: AuthContext = { userId: 'admin-user', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
    const result = await useCase.execute('report-1', auth);

    expect(result).toEqual({
      id: 'report-1',
      reportType: 'APPOINTMENTS',
      status: 'READY',
      filters: { fromDate: '2026-03-01', toDate: '2026-03-15' },
      rowCount: 42,
      requestedBy: { id: 'user-1', name: 'Unknown' },
      createdAt: new Date('2026-03-16T07:00:00Z'),
      startedAt: new Date('2026-03-16T07:00:02Z'),
      completedAt: new Date('2026-03-16T07:00:45Z'),
      failedAt: null,
      expiresAt: new Date('2026-04-15T07:00:45Z'),
      errorMessage: null,
      fileUrl: null,
    });
  });
});
