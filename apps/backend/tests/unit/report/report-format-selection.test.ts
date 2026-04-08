import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessReportJobUseCase } from '../../../src/modules/report/application/use-cases/process-report-job.use-case';
import type { ReportGeneratorMap } from '../../../src/modules/report/application/use-cases/process-report-job.use-case';
import { ReportEntity } from '../../../src/modules/report/domain/report.entity';
import type { IReportRepository } from '../../../src/modules/report/domain/report.repository';
import type { IReportStorageService } from '../../../src/modules/report/domain/report-storage.service';
import type { IXlsxGenerator } from '../../../src/modules/report/domain/xlsx-generator';
import type { IReportDataReader } from '../../../src/modules/report/domain/report-data-reader';
import type { IReportGenerator } from '../../../src/modules/report/domain/report-generator';

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
    countByTenantAndStatuses: vi.fn(),
    findExpiredWithFileKey: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    update: vi.fn(),
  };

  const storageService: IReportStorageService = {
    upload: vi.fn(),
    download: vi.fn(),
    generatePresignedGetUrl: vi.fn(),
    deleteObject: vi.fn(),
  };

  const xlsxGenerator: IXlsxGenerator = {
    generate: vi.fn().mockResolvedValue(Buffer.from('xlsx-content')),
  };

  const dataReader: IReportDataReader = {
    getInspectionRows: vi.fn().mockResolvedValue([
      { appointmentId: 'apt-1', serviceType: 'Routine Inspection' },
    ]),
    getInspectorPerformanceRows: vi.fn().mockResolvedValue([]),
    getConfirmationStatusRows: vi.fn().mockResolvedValue([]),
    getFinancialServicesRows: vi.fn().mockResolvedValue([]),
  };

  const csvGenerator: IReportGenerator = {
    generate: vi.fn().mockResolvedValue(Buffer.from('csv-content')),
    contentType: vi.fn().mockReturnValue('text/csv'),
    fileExtension: vi.fn().mockReturnValue('csv'),
  };

  const pdfGenerator: IReportGenerator = {
    generate: vi.fn().mockResolvedValue(Buffer.from('pdf-content')),
    contentType: vi.fn().mockReturnValue('application/pdf'),
    fileExtension: vi.fn().mockReturnValue('pdf'),
  };

  const xlsxGeneratorAdapter: IReportGenerator = {
    generate: vi.fn().mockResolvedValue(Buffer.from('xlsx-content')),
    contentType: vi.fn().mockReturnValue('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    fileExtension: vi.fn().mockReturnValue('xlsx'),
  };

  const generatorMap: ReportGeneratorMap = {
    XLSX: xlsxGeneratorAdapter,
    CSV: csvGenerator,
    PDF: pdfGenerator,
  };

  return { reportRepo, storageService, xlsxGenerator, dataReader, csvGenerator, pdfGenerator, xlsxGeneratorAdapter, generatorMap };
}

describe('ProcessReportJobUseCase - format selection', () => {
  let mocks: ReturnType<typeof makeMocks>;
  let useCase: ProcessReportJobUseCase;

  beforeEach(() => {
    mocks = makeMocks();
    useCase = new ProcessReportJobUseCase(
      mocks.reportRepo,
      mocks.storageService,
      mocks.xlsxGenerator,
      mocks.dataReader,
      undefined,
      undefined,
      mocks.generatorMap,
    );
  });

  it('routes CSV format to CsvReportGenerator', async () => {
    const report = makeReport({ format: 'CSV' as any });
    vi.mocked(mocks.reportRepo.findById).mockResolvedValue(report);

    await useCase.execute('report-1');

    expect(mocks.csvGenerator.generate).toHaveBeenCalled();
    expect(mocks.storageService.upload).toHaveBeenCalledWith(
      'reports/tenant-1/INSPECTIONS_DONE/report-1.csv',
      Buffer.from('csv-content'),
      'text/csv',
    );
    expect(report.status).toBe('READY');
    expect(report.fileKey).toBe('reports/tenant-1/INSPECTIONS_DONE/report-1.csv');
  });

  it('routes PDF format to PdfReportGenerator', async () => {
    const report = makeReport({ format: 'PDF' as any });
    vi.mocked(mocks.reportRepo.findById).mockResolvedValue(report);

    await useCase.execute('report-1');

    expect(mocks.pdfGenerator.generate).toHaveBeenCalled();
    expect(mocks.storageService.upload).toHaveBeenCalledWith(
      'reports/tenant-1/INSPECTIONS_DONE/report-1.pdf',
      Buffer.from('pdf-content'),
      'application/pdf',
    );
    expect(report.status).toBe('READY');
    expect(report.fileKey).toBe('reports/tenant-1/INSPECTIONS_DONE/report-1.pdf');
  });

  it('routes XLSX format through the generator map', async () => {
    const report = makeReport({ format: 'XLSX' });
    vi.mocked(mocks.reportRepo.findById).mockResolvedValue(report);

    await useCase.execute('report-1');

    expect(mocks.xlsxGeneratorAdapter.generate).toHaveBeenCalled();
    expect(mocks.storageService.upload).toHaveBeenCalledWith(
      'reports/tenant-1/INSPECTIONS_DONE/report-1.xlsx',
      Buffer.from('xlsx-content'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('falls back to xlsxGenerator when generatorMap is not provided', async () => {
    const useCaseNoMap = new ProcessReportJobUseCase(
      mocks.reportRepo,
      mocks.storageService,
      mocks.xlsxGenerator,
      mocks.dataReader,
    );
    const report = makeReport({ format: 'XLSX' });
    vi.mocked(mocks.reportRepo.findById).mockResolvedValue(report);

    await useCaseNoMap.execute('report-1');

    expect(mocks.xlsxGenerator.generate).toHaveBeenCalled();
    expect(mocks.storageService.upload).toHaveBeenCalledWith(
      'reports/tenant-1/INSPECTIONS_DONE/report-1.xlsx',
      expect.any(Buffer),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });
});
