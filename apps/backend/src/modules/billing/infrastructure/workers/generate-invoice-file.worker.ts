import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import type { IXlsxGenerator, ReportColumn } from '../../../report/domain/xlsx-generator';
import type { IReportStorageService } from '../../../report/domain/report-storage.service';
import type { Logger } from '../../../../shared/infrastructure/logger';

const INVOICE_COLUMNS: ReportColumn[] = [
  { key: 'entryId', label: 'Entry ID', width: 36 },
  { key: 'appointmentId', label: 'Appointment ID', width: 36 },
  { key: 'amount', label: 'Amount', width: 12 },
  { key: 'currency', label: 'Currency', width: 8 },
  { key: 'status', label: 'Status', width: 12 },
  { key: 'effectiveDate', label: 'Effective Date', width: 14 },
  { key: 'description', label: 'Description', width: 30 },
];

export class GenerateInvoiceFileWorker {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly xlsxGenerator: IXlsxGenerator,
    private readonly storageService: IReportStorageService,
    private readonly logger: Logger,
  ) {}

  async execute(data: { invoiceId: string }): Promise<void> {
    const { invoiceId } = data;

    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice) {
      this.logger.warn({ invoiceId }, 'Invoice not found for file generation');
      return;
    }

    if (invoice.fileKey) {
      this.logger.info({ invoiceId }, 'Invoice file already generated, skipping');
      return;
    }

    this.logger.info({ invoiceId, inspectorId: invoice.inspectorId }, 'Generating invoice file');

    // Load financial entries for the inspector and period
    const entries = await this.financialEntryRepo.findAll(
      {
        inspectorId: invoice.inspectorId,
        entryType: 'INSPECTOR_PAYOUT',
        status: 'APPROVED',
        fromDate: invoice.periodStart.toISOString().split('T')[0],
        toDate: invoice.periodEnd.toISOString().split('T')[0],
      },
      { page: 1, pageSize: 10000, sortBy: 'createdAt', sortOrder: 'asc' },
    );

    // Generate XLSX
    const rows = entries.map((entry) => ({
      entryId: entry.id,
      appointmentId: entry.appointmentId ?? '',
      amount: entry.amount,
      currency: entry.currency,
      status: entry.status,
      effectiveDate: entry.effectiveAt.toISOString().split('T')[0]!,
      description: entry.description ?? '',
    }));

    const buffer = await this.xlsxGenerator.generate(INVOICE_COLUMNS, rows);

    // Upload to S3
    const fileKey = `invoices/${invoice.inspectorId}/${invoiceId}.xlsx`;
    await this.storageService.upload(
      fileKey,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    // Update invoice record with file key
    await this.invoiceRepo.update(invoiceId, { fileKey });

    this.logger.info({ invoiceId, fileKey, entryCount: entries.length }, 'Invoice file generated');
  }
}
