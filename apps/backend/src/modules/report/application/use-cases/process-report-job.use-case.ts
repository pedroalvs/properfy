import type { IReportRepository } from '../../domain/report.repository';
import type { IReportStorageService } from '../../domain/report-storage.service';
import type { IXlsxGenerator } from '../../domain/xlsx-generator';
import type { IReportDataReader, ReportDataFilters } from '../../domain/report-data-reader';
import { REPORT_COLUMNS } from '../../domain/report.constants';

export class ProcessReportJobUseCase {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly storageService: IReportStorageService,
    private readonly xlsxGenerator: IXlsxGenerator,
    private readonly dataReader: IReportDataReader,
  ) {}

  async execute(reportId: string): Promise<void> {
    // 1. Load report - must be PENDING (idempotency)
    const report = await this.reportRepo.findById(reportId);
    if (!report || !report.isPending()) {
      return; // idempotent: already processed or not found
    }

    try {
      // 2. Mark processing
      report.markProcessing();
      await this.reportRepo.update(report);

      // 3. Build data filters from filtersJson
      const filters = report.filtersJson as ReportDataFilters;

      // 4. Dispatch to correct data reader based on reportType
      let rows: Record<string, unknown>[];
      switch (report.reportType) {
        case 'INSPECTIONS_SCHEDULED':
          rows = await this.dataReader.getInspectionRows(filters, 'SCHEDULED');
          break;
        case 'INSPECTIONS_DONE':
          rows = await this.dataReader.getInspectionRows(filters, 'DONE');
          break;
        case 'INSPECTIONS_CANCELLED':
          rows = await this.dataReader.getInspectionRows(filters, 'CANCELLED');
          break;
        case 'INSPECTIONS_REJECTED':
          rows = await this.dataReader.getInspectionRows(filters, 'REJECTED');
          break;
        case 'INSPECTOR_PERFORMANCE':
          rows = await this.dataReader.getInspectorPerformanceRows(filters);
          break;
        case 'CONFIRMATION_STATUS':
          rows = await this.dataReader.getConfirmationStatusRows(filters);
          break;
        case 'FINANCIAL_SERVICES':
          rows = await this.dataReader.getFinancialServicesRows(filters);
          break;
        default:
          throw new Error(`Unsupported report type: ${report.reportType}`);
      }

      // 5. Get column spec
      const columns = REPORT_COLUMNS[report.reportType];
      if (!columns) {
        throw new Error(`No column spec for report type: ${report.reportType}`);
      }

      // 6. Generate XLSX
      const buffer = await this.xlsxGenerator.generate(columns, rows);

      // 7. Upload to storage
      const tenantFolder = report.tenantId ?? 'platform';
      const fileKey = `reports/${tenantFolder}/${report.reportType}/${report.id}.xlsx`;
      await this.storageService.upload(
        fileKey,
        buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      // 8. Mark ready
      report.markReady(fileKey, rows.length);
      await this.reportRepo.update(report);
    } catch (error) {
      // 9. Mark failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      report.markFailed(errorMessage);
      await this.reportRepo.update(report);
    }
  }
}
