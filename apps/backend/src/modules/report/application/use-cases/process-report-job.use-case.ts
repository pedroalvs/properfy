import type { IReportRepository } from '../../domain/report.repository';
import type { IReportStorageService } from '../../domain/report-storage.service';
import type { IXlsxGenerator } from '../../domain/xlsx-generator';
import type { IReportDataReader, ReportDataFilters } from '../../domain/report-data-reader';
import { REPORT_COLUMNS } from '../../domain/report.constants';

export interface ReportNotificationSender {
  execute(input: {
    tenantId: string;
    recipient: string;
    channel: 'EMAIL' | 'SMS';
    templateCode: string;
    payloadJson: Record<string, string>;
  }): Promise<{ notificationId: string }>;
}

export interface ReportUserReader {
  findById(id: string): Promise<{ id: string; name: string; email: string } | null>;
}

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class ProcessReportJobUseCase {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly storageService: IReportStorageService,
    private readonly xlsxGenerator: IXlsxGenerator,
    private readonly dataReader: IReportDataReader,
    private readonly notificationSender?: ReportNotificationSender,
    private readonly userReader?: ReportUserReader,
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
      const filters = report.filtersJson as unknown as ReportDataFilters;

      // 4. Dispatch to the reader for the report type
      let rows: Record<string, unknown>[];
      switch (report.reportType) {
        case 'APPOINTMENTS':
          rows = await this.dataReader.getAppointmentRows(filters);
          break;
        case 'FINANCIAL':
          rows = await this.dataReader.getFinancialRows(filters);
          break;
        case 'PERFORMANCE':
          rows = await this.dataReader.getPerformanceRows(filters);
          break;
        case 'AGENCIES':
          rows = await this.dataReader.getAgencyRows(filters);
          break;
        default:
          throw new Error(`Unsupported report type: ${report.reportType}`);
      }

      // 5. Generate the XLSX (the only supported output format)
      const columns = REPORT_COLUMNS[report.reportType];
      const buffer = await this.xlsxGenerator.generate(columns, rows);

      // 6. Upload to storage
      const tenantFolder = report.tenantId ?? 'platform';
      const fileKey = `reports/${tenantFolder}/${report.reportType}/${report.id}.xlsx`;
      await this.storageService.upload(fileKey, buffer, XLSX_CONTENT_TYPE);

      // 7. Mark ready + notify the requester
      report.markReady(fileKey, rows.length);
      await this.reportRepo.update(report);

      await this.sendReportReadyNotification(
        report.id,
        report.tenantId,
        report.requestedByUserId,
        report.reportType,
      );
    } catch (error) {
      // 8. Mark failed + notify the requester
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      report.markFailed(errorMessage);
      await this.reportRepo.update(report);

      await this.sendReportFailedNotification(
        report.id,
        report.tenantId,
        report.requestedByUserId,
        report.reportType,
        errorMessage,
      );
    }
  }

  private async sendReportReadyNotification(
    reportId: string,
    tenantId: string | null,
    requestedByUserId: string,
    reportType: string,
  ): Promise<void> {
    if (!this.notificationSender || !this.userReader || !tenantId) {
      return;
    }

    try {
      const user = await this.userReader.findById(requestedByUserId);
      if (!user?.email) {
        return;
      }

      const downloadLink = `/reports/${reportId}`;

      await this.notificationSender.execute({
        tenantId,
        recipient: user.email,
        channel: 'EMAIL',
        templateCode: 'REPORT_READY',
        payloadJson: {
          userName: user.name,
          reportType,
          reportId,
          downloadLink,
        },
      });
    } catch {
      // Notification failure should not fail the report processing
    }
  }

  private async sendReportFailedNotification(
    reportId: string,
    tenantId: string | null,
    requestedByUserId: string,
    reportType: string,
    errorMessage: string,
  ): Promise<void> {
    if (!this.notificationSender || !this.userReader || !tenantId) {
      return;
    }

    try {
      const user = await this.userReader.findById(requestedByUserId);
      if (!user?.email) {
        return;
      }

      const downloadLink = `/reports/${reportId}`;

      await this.notificationSender.execute({
        tenantId,
        recipient: user.email,
        channel: 'EMAIL',
        templateCode: 'REPORT_FAILED',
        payloadJson: {
          userName: user.name,
          reportType,
          reportId,
          errorMessage,
          downloadLink,
        },
      });
    } catch {
      // Notification failure must not affect report state
    }
  }
}
