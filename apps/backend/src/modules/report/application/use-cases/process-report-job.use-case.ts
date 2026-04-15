import type { IReportRepository } from '../../domain/report.repository';
import type { IReportStorageService } from '../../domain/report-storage.service';
import type { IXlsxGenerator } from '../../domain/xlsx-generator';
import type { IReportGenerator } from '../../domain/report-generator';
import type { IReportDataReader, ReportDataFilters } from '../../domain/report-data-reader';
import type { IScheduledReportRunRepository } from '../../domain/scheduled-report-run.repository';
import type { DeliverScheduledReportUseCase } from './deliver-scheduled-report.use-case';
import { REPORT_COLUMNS } from '../../domain/report.constants';

export interface ReportNotificationSender {
  execute(input: {
    tenantId: string;
    recipient: string;
    channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
    templateCode: string;
    payloadJson: Record<string, string>;
  }): Promise<{ notificationId: string }>;
}

export interface ReportUserReader {
  findById(id: string): Promise<{ id: string; name: string; email: string } | null>;
}

export interface ReportGeneratorMap {
  [format: string]: IReportGenerator;
}

export class ProcessReportJobUseCase {
  constructor(
    private readonly reportRepo: IReportRepository,
    private readonly storageService: IReportStorageService,
    private readonly xlsxGenerator: IXlsxGenerator,
    private readonly dataReader: IReportDataReader,
    private readonly notificationSender?: ReportNotificationSender,
    private readonly userReader?: ReportUserReader,
    private readonly generatorMap?: ReportGeneratorMap,
    // Feature 019: optional deps for scheduled-report routing
    private readonly scheduledReportRunRepo?: IScheduledReportRunRepository,
    private readonly deliverScheduledReportUseCase?: DeliverScheduledReportUseCase,
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

      // 5. Get column spec (filter by user-defined columns if specified)
      let columns = REPORT_COLUMNS[report.reportType];
      if (!columns) {
        throw new Error(`No column spec for report type: ${report.reportType}`);
      }
      const requestedColumns = (report.filtersJson as Record<string, unknown>).columns as string[] | undefined;
      if (requestedColumns && Array.isArray(requestedColumns) && requestedColumns.length > 0) {
        const requestedSet = new Set(requestedColumns);
        columns = columns.filter((col) => requestedSet.has(col.key));
      }

      // 6. Generate report in the requested format
      const generator = this.generatorMap?.[report.format];
      let buffer: Buffer;
      let contentType: string;
      let fileExtension: string;

      if (generator) {
        buffer = await generator.generate(columns, rows);
        contentType = generator.contentType();
        fileExtension = generator.fileExtension();
      } else {
        // Fallback to XLSX generator for backwards compatibility
        buffer = await this.xlsxGenerator.generate(columns, rows);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        fileExtension = 'xlsx';
      }

      // 7. Upload to storage
      const tenantFolder = report.tenantId ?? 'platform';
      const fileKey = `reports/${tenantFolder}/${report.reportType}/${report.id}.${fileExtension}`;
      await this.storageService.upload(
        fileKey,
        buffer,
        contentType,
      );

      // 8. Mark ready
      report.markReady(fileKey, rows.length);
      await this.reportRepo.update(report);

      // 9. Feature 019: route to the delivery fan-out use case when the report
      //    was created by a schedule. The fan-out resolves recipients per the
      //    schedule's delivery mode and records per-recipient outcomes on the
      //    ScheduledReportRun. On-demand reports keep the single-recipient path.
      if (report.scheduledReportId && this.deliverScheduledReportUseCase && this.scheduledReportRunRepo) {
        const run = await this.scheduledReportRunRepo.findByReportId(report.id);
        if (run) {
          try {
            await this.deliverScheduledReportUseCase.execute({ runId: run.id });
          } catch {
            // Delivery failure must not affect report state. Individual recipient
            // failures are captured in `delivery_status_json` on the run.
          }
        }
      } else if (!report.scheduledReportId) {
        await this.sendReportReadyNotification(
          report.id,
          report.tenantId,
          report.requestedByUserId,
          report.reportType,
        );
      }
    } catch (error) {
      // 10. Mark failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      report.markFailed(errorMessage);
      await this.reportRepo.update(report);

      // Feature 019 US1: notify the requesting user that the report failed.
      // For scheduled reports, only the owner is notified; recipient fan-out
      // is not applicable to failed runs.
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

  /**
   * Feature 019 US1: emit a `REPORT_FAILED` notification to the requesting user
   * when report generation fails. Graceful no-op if the user has no email.
   */
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
