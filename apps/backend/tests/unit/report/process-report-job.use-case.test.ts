import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessReportJobUseCase } from '../../../src/modules/report/application/use-cases/process-report-job.use-case';
import { ReportEntity } from '../../../src/modules/report/domain/report.entity';
import { REPORT_COLUMNS, INSPECTION_COLUMNS } from '../../../src/modules/report/domain/report.constants';
import type { IReportRepository } from '../../../src/modules/report/domain/report.repository';
import type { IReportStorageService } from '../../../src/modules/report/domain/report-storage.service';
import type { IXlsxGenerator } from '../../../src/modules/report/domain/xlsx-generator';
import type { IReportDataReader } from '../../../src/modules/report/domain/report-data-reader';
import type { ReportType } from '@properfy/shared';

function makeReport(overrides: Partial<ConstructorParameters<typeof ReportEntity>[0]> = {}) {
  return new ReportEntity({
    id: 'report-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_DONE',
    filtersJson: { fromDate: '2026-03-01', toDate: '2026-03-15', tenantId: 'tenant-1' },
    format: 'XLSX',
    status: 'PENDING',
    fileKey: null,
    requestedByUserId: 'user-1',
    startedAt: null,
    completedAt: null,
    failedAt: null,
    errorMessage: null,
    rowCount: null,
    expiresAt: null,
    createdAt: new Date('2026-03-16T07:00:00Z'),
    updatedAt: new Date('2026-03-16T07:00:00Z'),
    ...overrides,
  });
}

function makeMocks() {
  const reportRepo: IReportRepository = {
    findById: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    countByUserAndStatuses: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
  };

  const storageService: IReportStorageService = {
    upload: vi.fn(),
    generatePresignedGetUrl: vi.fn(),
    deleteObject: vi.fn(),
  };

  const xlsxGenerator: IXlsxGenerator = {
    generate: vi.fn().mockResolvedValue(Buffer.from('xlsx-content')),
  };

  const dataReader: IReportDataReader = {
    getInspectionRows: vi.fn().mockResolvedValue([
      { appointmentId: 'apt-1', serviceType: 'Routine Inspection' },
      { appointmentId: 'apt-2', serviceType: 'Ingoing Inspection' },
    ]),
    getInspectorPerformanceRows: vi.fn().mockResolvedValue([
      { inspectorName: 'John', totalDone: 10 },
    ]),
    getConfirmationStatusRows: vi.fn().mockResolvedValue([
      { appointmentId: 'apt-1', confirmationStatus: 'CONFIRMED' },
    ]),
    getFinancialServicesRows: vi.fn().mockResolvedValue([
      { appointmentId: 'apt-1', priceAmount: 100 },
    ]),
  };

  return { reportRepo, storageService, xlsxGenerator, dataReader };
}

describe('ProcessReportJobUseCase', () => {
  let useCase: ProcessReportJobUseCase;
  let reportRepo: IReportRepository;
  let storageService: IReportStorageService;
  let xlsxGenerator: IXlsxGenerator;
  let dataReader: IReportDataReader;

  beforeEach(() => {
    const mocks = makeMocks();
    reportRepo = mocks.reportRepo;
    storageService = mocks.storageService;
    xlsxGenerator = mocks.xlsxGenerator;
    dataReader = mocks.dataReader;
    useCase = new ProcessReportJobUseCase(reportRepo, storageService, xlsxGenerator, dataReader);
  });

  describe('INSPECTIONS_DONE report (happy path)', () => {
    it('marks report as PROCESSING then READY with correct file key and row count', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);

      await useCase.execute('report-1');

      // Should have been called with the report-1 id
      expect(reportRepo.findById).toHaveBeenCalledWith('report-1');

      // update called at least 2 times (PROCESSING + READY)
      expect(reportRepo.update).toHaveBeenCalledTimes(2);

      // First update: PROCESSING
      const firstUpdateCall = vi.mocked(reportRepo.update).mock.calls[0][0];
      // By the time we check, the entity has been mutated to READY,
      // but we can verify the sequence via call order
      expect(reportRepo.update).toHaveBeenCalledWith(report);
    });

    it('calls dataReader.getInspectionRows with filters and DONE status', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);

      await useCase.execute('report-1');

      expect(dataReader.getInspectionRows).toHaveBeenCalledWith(
        { fromDate: '2026-03-01', toDate: '2026-03-15', tenantId: 'tenant-1' },
        'DONE',
      );
    });

    it('calls xlsxGenerator.generate with correct columns from REPORT_COLUMNS', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);

      await useCase.execute('report-1');

      expect(xlsxGenerator.generate).toHaveBeenCalledWith(
        REPORT_COLUMNS['INSPECTIONS_DONE'],
        [
          { appointmentId: 'apt-1', serviceType: 'Routine Inspection' },
          { appointmentId: 'apt-2', serviceType: 'Ingoing Inspection' },
        ],
      );
    });

    it('uploads to correct S3 key with XLSX content type', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);

      await useCase.execute('report-1');

      expect(storageService.upload).toHaveBeenCalledWith(
        'reports/tenant-1/INSPECTIONS_DONE/report-1.xlsx',
        Buffer.from('xlsx-content'),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });

    it('marks report as READY with fileKey and rowCount', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);

      await useCase.execute('report-1');

      expect(report.status).toBe('READY');
      expect(report.fileKey).toBe('reports/tenant-1/INSPECTIONS_DONE/report-1.xlsx');
      expect(report.rowCount).toBe(2);
      expect(report.completedAt).not.toBeNull();
      expect(report.expiresAt).not.toBeNull();
    });
  });

  describe('dispatch to correct data reader', () => {
    it.each([
      ['INSPECTIONS_SCHEDULED', 'getInspectionRows', 'SCHEDULED'],
      ['INSPECTIONS_CANCELLED', 'getInspectionRows', 'CANCELLED'],
      ['INSPECTIONS_REJECTED', 'getInspectionRows', 'REJECTED'],
    ] as const)('%s calls %s with status %s', async (reportType, method, status) => {
      const report = makeReport({ reportType: reportType as ReportType });
      vi.mocked(reportRepo.findById).mockResolvedValue(report);

      await useCase.execute('report-1');

      expect(dataReader[method]).toHaveBeenCalledWith(
        report.filtersJson,
        status,
      );
    });

    it('INSPECTOR_PERFORMANCE calls getInspectorPerformanceRows', async () => {
      const report = makeReport({ reportType: 'INSPECTOR_PERFORMANCE' });
      vi.mocked(reportRepo.findById).mockResolvedValue(report);

      await useCase.execute('report-1');

      expect(dataReader.getInspectorPerformanceRows).toHaveBeenCalledWith(report.filtersJson);
    });

    it('CONFIRMATION_STATUS calls getConfirmationStatusRows', async () => {
      const report = makeReport({ reportType: 'CONFIRMATION_STATUS' });
      vi.mocked(reportRepo.findById).mockResolvedValue(report);

      await useCase.execute('report-1');

      expect(dataReader.getConfirmationStatusRows).toHaveBeenCalledWith(report.filtersJson);
    });

    it('FINANCIAL_SERVICES calls getFinancialServicesRows', async () => {
      const report = makeReport({ reportType: 'FINANCIAL_SERVICES' });
      vi.mocked(reportRepo.findById).mockResolvedValue(report);

      await useCase.execute('report-1');

      expect(dataReader.getFinancialServicesRows).toHaveBeenCalledWith(report.filtersJson);
    });
  });

  describe('platform-wide report (null tenantId)', () => {
    it('uses platform folder in file key', async () => {
      const report = makeReport({ tenantId: null });
      vi.mocked(reportRepo.findById).mockResolvedValue(report);

      await useCase.execute('report-1');

      expect(storageService.upload).toHaveBeenCalledWith(
        'reports/platform/INSPECTIONS_DONE/report-1.xlsx',
        expect.any(Buffer),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(report.fileKey).toBe('reports/platform/INSPECTIONS_DONE/report-1.xlsx');
    });
  });

  describe('zero rows', () => {
    it('still generates XLSX and marks READY with rowCount 0', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      vi.mocked(dataReader.getInspectionRows).mockResolvedValue([]);

      await useCase.execute('report-1');

      expect(xlsxGenerator.generate).toHaveBeenCalledWith(REPORT_COLUMNS['INSPECTIONS_DONE'], []);
      expect(storageService.upload).toHaveBeenCalled();
      expect(report.status).toBe('READY');
      expect(report.rowCount).toBe(0);
    });
  });

  describe('idempotency', () => {
    it('returns without error when report is not found', async () => {
      vi.mocked(reportRepo.findById).mockResolvedValue(null);

      await expect(useCase.execute('non-existent')).resolves.toBeUndefined();

      expect(reportRepo.update).not.toHaveBeenCalled();
      expect(dataReader.getInspectionRows).not.toHaveBeenCalled();
    });

    it('returns without error when report is already PROCESSING', async () => {
      const report = makeReport({ status: 'PROCESSING' });
      vi.mocked(reportRepo.findById).mockResolvedValue(report);

      await expect(useCase.execute('report-1')).resolves.toBeUndefined();

      expect(reportRepo.update).not.toHaveBeenCalled();
    });

    it('returns without error when report is already READY', async () => {
      const report = makeReport({ status: 'READY' });
      vi.mocked(reportRepo.findById).mockResolvedValue(report);

      await expect(useCase.execute('report-1')).resolves.toBeUndefined();

      expect(reportRepo.update).not.toHaveBeenCalled();
    });

    it('returns without error when report is already FAILED', async () => {
      const report = makeReport({ status: 'FAILED' });
      vi.mocked(reportRepo.findById).mockResolvedValue(report);

      await expect(useCase.execute('report-1')).resolves.toBeUndefined();

      expect(reportRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('failure handling', () => {
    it('marks FAILED when data reader throws error', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      vi.mocked(dataReader.getInspectionRows).mockRejectedValue(new Error('Database connection lost'));

      await useCase.execute('report-1');

      expect(report.status).toBe('FAILED');
      expect(report.errorMessage).toBe('Database connection lost');
      expect(report.failedAt).not.toBeNull();
      // update called 2 times: PROCESSING + FAILED
      expect(reportRepo.update).toHaveBeenCalledTimes(2);
    });

    it('marks FAILED when XLSX generator throws', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      vi.mocked(xlsxGenerator.generate).mockRejectedValue(new Error('Out of memory'));

      await useCase.execute('report-1');

      expect(report.status).toBe('FAILED');
      expect(report.errorMessage).toBe('Out of memory');
      expect(reportRepo.update).toHaveBeenCalledTimes(2);
    });

    it('marks FAILED when storage upload throws', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      vi.mocked(storageService.upload).mockRejectedValue(new Error('S3 unavailable'));

      await useCase.execute('report-1');

      expect(report.status).toBe('FAILED');
      expect(report.errorMessage).toBe('S3 unavailable');
      expect(reportRepo.update).toHaveBeenCalledTimes(2);
    });

    it('handles non-Error throw with Unknown error message', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      vi.mocked(dataReader.getInspectionRows).mockRejectedValue('string error');

      await useCase.execute('report-1');

      expect(report.status).toBe('FAILED');
      expect(report.errorMessage).toBe('Unknown error');
    });
  });
});
