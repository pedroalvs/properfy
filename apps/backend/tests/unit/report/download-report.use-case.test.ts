import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadReportUseCase } from '../../../src/modules/report/application/use-cases/download-report.use-case';
import type { AuthContext } from '../../../src/modules/report/application/use-cases/download-report.use-case';
import type { IReportRepository } from '../../../src/modules/report/domain/report.repository';
import type { IReportStorageService } from '../../../src/modules/report/domain/report-storage.service';
import { ReportEntity } from '../../../src/modules/report/domain/report.entity';
import type { ReportProps } from '../../../src/modules/report/domain/report.entity';
import {
  ReportNotFoundError,
  ReportNotReadyError,
  ReportExpiredError,
  ReportForbiddenError,
} from '../../../src/modules/report/domain/report.errors';

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
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
    countByTenantAndStatuses: vi.fn(),
    findExpiredWithFileKey: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    update: vi.fn(),
  };
}

function makeMockStorage(): IReportStorageService {
  return {
    upload: vi.fn(),
    generatePresignedGetUrl: vi.fn(),
    deleteObject: vi.fn(),
  };
}

describe('DownloadReportUseCase', () => {
  let useCase: DownloadReportUseCase;
  let repo: IReportRepository;
  let storage: IReportStorageService;
  const defaultAuth: AuthContext = { userId: 'user-1', tenantId: 'tenant-1', role: 'AM', branchId: null, inspectorId: null };

  beforeEach(() => {
    repo = makeMockRepo();
    storage = makeMockStorage();
    useCase = new DownloadReportUseCase(repo, storage);
  });

  it('returns presigned URL for READY report with valid fileKey', async () => {
    const report = makeReport();
    vi.mocked(repo.findById).mockResolvedValue(report);
    vi.mocked(storage.generatePresignedGetUrl).mockResolvedValue('https://storage.example.com/signed-url');

    const result = await useCase.execute('report-1', defaultAuth);

    expect(result.downloadUrl).toBe('https://storage.example.com/signed-url');
    expect(storage.generatePresignedGetUrl).toHaveBeenCalledWith(
      'reports/tenant-1/APPOINTMENTS/report-1.xlsx',
      3600,
    );
  });

  it('returns correct fileName format', async () => {
    const report = makeReport();
    vi.mocked(repo.findById).mockResolvedValue(report);
    vi.mocked(storage.generatePresignedGetUrl).mockResolvedValue('https://storage.example.com/signed-url');

    const result = await useCase.execute('report-1', defaultAuth);

    expect(result.fileName).toBe('appointments-2026-03-01-to-2026-03-15.xlsx');
  });

  it('returns expiresAt in the future', async () => {
    const report = makeReport();
    vi.mocked(repo.findById).mockResolvedValue(report);
    vi.mocked(storage.generatePresignedGetUrl).mockResolvedValue('https://storage.example.com/signed-url');

    const before = new Date();
    const result = await useCase.execute('report-1', defaultAuth);

    expect(result.expiresAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it('throws ReportNotReadyError for PENDING report', async () => {
    const report = makeReport({ status: 'PENDING' as any });
    vi.mocked(repo.findById).mockResolvedValue(report);

    await expect(useCase.execute('report-1', defaultAuth)).rejects.toThrow(ReportNotReadyError);
  });

  it('throws ReportNotReadyError for PROCESSING report', async () => {
    const report = makeReport({ status: 'PROCESSING' as any });
    vi.mocked(repo.findById).mockResolvedValue(report);

    await expect(useCase.execute('report-1', defaultAuth)).rejects.toThrow(ReportNotReadyError);
  });

  it('throws ReportNotReadyError for FAILED report', async () => {
    const report = makeReport({ status: 'FAILED' as any, errorMessage: 'oops' });
    vi.mocked(repo.findById).mockResolvedValue(report);

    await expect(useCase.execute('report-1', defaultAuth)).rejects.toThrow(ReportNotReadyError);
  });

  it('throws ReportExpiredError when expiresAt is in the past', async () => {
    const report = makeReport({ expiresAt: new Date('2025-01-01T00:00:00Z') });
    vi.mocked(repo.findById).mockResolvedValue(report);

    await expect(useCase.execute('report-1', defaultAuth)).rejects.toThrow(ReportExpiredError);
  });

  it('throws ReportNotFoundError when report does not exist', async () => {
    vi.mocked(repo.findById).mockResolvedValue(null);

    await expect(useCase.execute('nonexistent', defaultAuth)).rejects.toThrow(ReportNotFoundError);
  });

  it('AM can download any report regardless of requestedByUserId', async () => {
    const report = makeReport({ requestedByUserId: 'other-user' });
    vi.mocked(repo.findById).mockResolvedValue(report);
    vi.mocked(storage.generatePresignedGetUrl).mockResolvedValue('https://storage.example.com/signed-url');

    const auth: AuthContext = { userId: 'admin-user', tenantId: null, role: 'AM', branchId: null, inspectorId: null };
    const result = await useCase.execute('report-1', auth);

    expect(result.downloadUrl).toBe('https://storage.example.com/signed-url');
  });

  it.each(['CL_ADMIN', 'CL_USER', 'INSP'] as const)('%s download is forbidden', async (role) => {
    const report = makeReport({ requestedByUserId: 'user-1' });
    vi.mocked(repo.findById).mockResolvedValue(report);

    const auth: AuthContext = { userId: 'user-1', tenantId: 'tenant-1', role, branchId: null, inspectorId: null };

    await expect(useCase.execute('report-1', auth)).rejects.toThrow(ReportForbiddenError);
  });

  it('throws ReportNotFoundError when fileKey is null on READY report', async () => {
    const report = makeReport({ fileKey: null });
    vi.mocked(repo.findById).mockResolvedValue(report);

    await expect(useCase.execute('report-1', defaultAuth)).rejects.toThrow(ReportNotFoundError);
  });
});
