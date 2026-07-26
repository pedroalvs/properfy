import { formatInvoiceNumber } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import type { IInvoicePdfGenerator } from '../../domain/invoice-pdf-generator';
import type { IReportStorageService } from '../../../report/domain/report-storage.service';
import type { Logger } from '../../../../shared/infrastructure/logger';

/**
 * Renders the Property Invoice PDF from the FROZEN snapshot (never a live ledger re-query) and
 * uploads it. Idempotent per invoice id — skips when a file already exists (spec 032).
 */
export class GenerateInvoiceFileWorker {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly pdfGenerator: IInvoicePdfGenerator,
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
    if (invoice.invoiceNumber == null || !invoice.lineItemsSnapshot || invoice.lineItemsSnapshot.length === 0) {
      // A CLOSED invoice always carries a number and frozen snapshot; guard defensively.
      this.logger.warn({ invoiceId }, 'Invoice missing number or frozen snapshot; skipping PDF generation');
      return;
    }

    this.logger.info({ invoiceId, inspectorId: invoice.inspectorId }, 'Generating invoice PDF');

    const buffer = await this.pdfGenerator.generate({
      invoiceNumberDisplay: formatInvoiceNumber(invoice.invoiceNumber)!,
      inspectorName: invoice.inspectorName,
      inspectorAbn: invoice.inspectorAbn,
      periodStart: invoice.periodStart.toISOString().slice(0, 10),
      periodEnd: invoice.periodEnd.toISOString().slice(0, 10),
      issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString().slice(0, 10) : null,
      currency: invoice.currency,
      totalAmount: invoice.totalAmount,
      lines: invoice.lineItemsSnapshot,
    });

    const fileKey = `invoices/${invoice.inspectorId}/${invoiceId}.pdf`;
    await this.storageService.upload(fileKey, buffer, 'application/pdf');

    await this.invoiceRepo.update(invoiceId, { fileKey });

    this.logger.info({ invoiceId, fileKey, lineCount: invoice.lineItemsSnapshot.length }, 'Invoice PDF generated');
  }
}
