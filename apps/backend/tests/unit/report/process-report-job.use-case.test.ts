import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessReportJobUseCase } from '../../../src/modules/report/application/use-cases/process-report-job.use-case';
import type { ReportNotificationSender, ReportUserReader } from '../../../src/modules/report/application/use-cases/process-report-job.use-case';
import { ReportEntity } from '../../../src/modules/report/domain/report.entity';
import { REPORT_COLUMNS } from '../../../src/modules/report/domain/report.constants';
import type { IReportRepository } from '../../../src/modules/report/domain/report.repository';
import type { IReportStorageService } from '../../../src/modules/report/domain/report-storage.service';
import type { IXlsxGenerator } from '../../../src/modules/report/domain/xlsx-generator';
import type { IReportDataReader } from '../../../src/modules/report/domain/report-data-reader';
import type { ReportType } from '@properfy/shared';

const XLSX_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function makeReport(overrides: Partial<ConstructorParameters<typeof ReportEntity>[0]> = {}) {
  return new ReportEntity({
    id: 'report-1',
    tenantId: 'tenant-1',
    reportType: 'APPOINTMENTS',
    filtersJson: { fromDate: '2026-03-01', toDate: '2026-03-15', dateAxis: 'SCHEDULED', tenantId: 'tenant-1' },
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
    findExpiredWithFileKey: vi.fn().mockResolvedValue([]),
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
    getAppointmentRows: vi.fn().mockResolvedValue([
      { appointmentNumber: 1, agency: 'Acme' },
      { appointmentNumber: 2, agency: 'Acme' },
    ]),
    getFinancialRows: vi.fn().mockResolvedValue([{ entryType: 'TENANT_DEBIT', revenue: 100 }]),
    getPerformanceRows: vi.fn().mockResolvedValue([{ inspectorName: 'John', completed: 10 }]),
    getAgencyRows: vi.fn().mockResolvedValue([{ agency: 'Acme', totalAppointments: 5 }]),
  };

  const notificationSender: ReportNotificationSender = {
    execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
  };

  const userReader: ReportUserReader = {
    findById: vi.fn().mockResolvedValue({ id: 'user-1', name: 'John Doe', email: 'john@example.com' }),
  };

  return { reportRepo, storageService, xlsxGenerator, dataReader, notificationSender, userReader };
}

describe('ProcessReportJobUseCase', () => {
  let useCase: ProcessReportJobUseCase;
  let reportRepo: IReportRepository;
  let storageService: IReportStorageService;
  let xlsxGenerator: IXlsxGenerator;
  let dataReader: IReportDataReader;
  let notificationSender: ReportNotificationSender;
  let userReader: ReportUserReader;

  beforeEach(() => {
    const mocks = makeMocks();
    reportRepo = mocks.reportRepo;
    storageService = mocks.storageService;
    xlsxGenerator = mocks.xlsxGenerator;
    dataReader = mocks.dataReader;
    notificationSender = mocks.notificationSender;
    userReader = mocks.userReader;
    useCase = new ProcessReportJobUseCase(
      reportRepo, storageService, xlsxGenerator, dataReader,
      notificationSender, userReader,
    );
  });

  describe('APPOINTMENTS report (happy path)', () => {
    it('marks PROCESSING then READY (2 updates)', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      await useCase.execute('report-1');
      expect(reportRepo.findById).toHaveBeenCalledWith('report-1');
      expect(reportRepo.update).toHaveBeenCalledTimes(2);
    });

    it('reads appointment rows with the persisted filters', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      await useCase.execute('report-1');
      expect(dataReader.getAppointmentRows).toHaveBeenCalledWith(report.filtersJson);
    });

    it('generates the XLSX with the fixed column set', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      await useCase.execute('report-1');
      expect(xlsxGenerator.generate).toHaveBeenCalledWith(REPORT_COLUMNS.APPOINTMENTS, [
        { appointmentNumber: 1, agency: 'Acme' },
        { appointmentNumber: 2, agency: 'Acme' },
      ]);
    });

    it('uploads to the correct key with the XLSX content type', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      await useCase.execute('report-1');
      expect(storageService.upload).toHaveBeenCalledWith(
        'reports/tenant-1/APPOINTMENTS/report-1.xlsx',
        Buffer.from('xlsx-content'),
        XLSX_CT,
      );
    });

    it('marks READY with fileKey and rowCount', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      await useCase.execute('report-1');
      expect(report.status).toBe('READY');
      expect(report.fileKey).toBe('reports/tenant-1/APPOINTMENTS/report-1.xlsx');
      expect(report.rowCount).toBe(2);
      expect(report.completedAt).not.toBeNull();
      expect(report.expiresAt).not.toBeNull();
    });
  });

  describe('dispatch to the correct reader', () => {
    it.each([
      ['APPOINTMENTS', 'getAppointmentRows'],
      ['FINANCIAL', 'getFinancialRows'],
      ['PERFORMANCE', 'getPerformanceRows'],
      ['AGENCIES', 'getAgencyRows'],
    ] as const)('%s calls %s', async (reportType, method) => {
      const report = makeReport({ reportType: reportType as ReportType });
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      await useCase.execute('report-1');
      expect(dataReader[method]).toHaveBeenCalledWith(report.filtersJson);
      expect(report.status).toBe('READY');
    });
  });

  describe('platform-wide report (null tenantId)', () => {
    it('uses the platform folder in the file key', async () => {
      const report = makeReport({ tenantId: null });
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      await useCase.execute('report-1');
      expect(storageService.upload).toHaveBeenCalledWith(
        'reports/platform/APPOINTMENTS/report-1.xlsx',
        expect.any(Buffer),
        XLSX_CT,
      );
      expect(report.fileKey).toBe('reports/platform/APPOINTMENTS/report-1.xlsx');
    });
  });

  describe('zero rows', () => {
    it('still generates the XLSX and marks READY with rowCount 0', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      vi.mocked(dataReader.getAppointmentRows).mockResolvedValue([]);
      await useCase.execute('report-1');
      expect(xlsxGenerator.generate).toHaveBeenCalledWith(REPORT_COLUMNS.APPOINTMENTS, []);
      expect(report.status).toBe('READY');
      expect(report.rowCount).toBe(0);
    });
  });

  describe('idempotency', () => {
    it('no-ops when the report is not found', async () => {
      vi.mocked(reportRepo.findById).mockResolvedValue(null);
      await expect(useCase.execute('missing')).resolves.toBeUndefined();
      expect(reportRepo.update).not.toHaveBeenCalled();
      expect(dataReader.getAppointmentRows).not.toHaveBeenCalled();
    });

    it.each(['PROCESSING', 'READY', 'FAILED'] as const)('no-ops when already %s', async (status) => {
      const report = makeReport({ status });
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      await expect(useCase.execute('report-1')).resolves.toBeUndefined();
      expect(reportRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('failure handling', () => {
    it('marks FAILED when the reader throws', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      vi.mocked(dataReader.getAppointmentRows).mockRejectedValue(new Error('Database connection lost'));
      await useCase.execute('report-1');
      expect(report.status).toBe('FAILED');
      expect(report.errorMessage).toBe('Database connection lost');
      expect(report.failedAt).not.toBeNull();
      expect(reportRepo.update).toHaveBeenCalledTimes(2);
    });

    it('marks FAILED when the generator throws', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      vi.mocked(xlsxGenerator.generate).mockRejectedValue(new Error('Out of memory'));
      await useCase.execute('report-1');
      expect(report.status).toBe('FAILED');
      expect(report.errorMessage).toBe('Out of memory');
    });

    it('marks FAILED when the upload throws', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      vi.mocked(storageService.upload).mockRejectedValue(new Error('S3 unavailable'));
      await useCase.execute('report-1');
      expect(report.status).toBe('FAILED');
      expect(report.errorMessage).toBe('S3 unavailable');
    });

    it('uses "Unknown error" for a non-Error throw', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      vi.mocked(dataReader.getAppointmentRows).mockRejectedValue('string error');
      await useCase.execute('report-1');
      expect(report.errorMessage).toBe('Unknown error');
    });
  });

  describe('notifications', () => {
    it('sends REPORT_READY on success', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      await useCase.execute('report-1');
      expect(notificationSender.execute).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        recipient: 'john@example.com',
        channel: 'EMAIL',
        templateCode: 'REPORT_READY',
        payloadJson: { userName: 'John Doe', reportType: 'APPOINTMENTS', reportId: 'report-1', downloadLink: '/reports/report-1' },
      });
    });

    it('sends REPORT_FAILED on failure', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      vi.mocked(dataReader.getAppointmentRows).mockRejectedValue(new Error('fail'));
      await useCase.execute('report-1');
      expect(notificationSender.execute).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        recipient: 'john@example.com',
        channel: 'EMAIL',
        templateCode: 'REPORT_FAILED',
        payloadJson: { userName: 'John Doe', reportType: 'APPOINTMENTS', reportId: 'report-1', errorMessage: 'fail', downloadLink: '/reports/report-1' },
      });
    });

    it('does not notify platform-wide reports (null tenantId)', async () => {
      const report = makeReport({ tenantId: null });
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      await useCase.execute('report-1');
      expect(report.status).toBe('READY');
      expect(notificationSender.execute).not.toHaveBeenCalled();
    });

    it('does not fail the report when the notification throws', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      vi.mocked(notificationSender.execute).mockRejectedValue(new Error('Email service down'));
      await useCase.execute('report-1');
      expect(report.status).toBe('READY');
    });

    it('skips the notification when the user is not found', async () => {
      const report = makeReport();
      vi.mocked(reportRepo.findById).mockResolvedValue(report);
      vi.mocked(userReader.findById).mockResolvedValue(null);
      await useCase.execute('report-1');
      expect(report.status).toBe('READY');
      expect(notificationSender.execute).not.toHaveBeenCalled();
    });

    it('works without a notification sender', async () => {
      const mocks = makeMocks();
      const uc = new ProcessReportJobUseCase(mocks.reportRepo, mocks.storageService, mocks.xlsxGenerator, mocks.dataReader);
      const report = makeReport();
      vi.mocked(mocks.reportRepo.findById).mockResolvedValue(report);
      await uc.execute('report-1');
      expect(report.status).toBe('READY');
    });
  });
});
