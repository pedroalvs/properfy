import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import {
  InvoiceNotFoundError,
  InvoiceNotReadyError,
  InvoiceFileNotGeneratedError,
} from '../../domain/billing.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IReportStorageService } from '../../../report/domain/report-storage.service';
import { PRESIGNED_URL_TTL_SECONDS } from '../../../report/domain/report.constants';

export interface DownloadInvoiceInput {
  invoiceId: string;
  actor: AuthContext;
}

export interface DownloadInvoiceOutput {
  downloadUrl: string;
  expiresAt: string;
}

export class DownloadInvoiceUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly storageService: IReportStorageService,
  ) {}

  async execute(input: DownloadInvoiceInput): Promise<DownloadInvoiceOutput> {
    const { invoiceId, actor } = input;

    // 1. Load invoice
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError();
    }

    // 2. Scope check. Sprint 1 W-4-IMPL (CORRECTION-001 close-it, 2026-04-13):
    //    inspector invoices are not tenant-scoped, so cross-inspector access
    //    is AM-only. OP loses access to inspector invoice downloads.
    if (actor.role === 'AM') {
      // Full access
    } else if (actor.role === 'INSP') {
      if (!actor.inspectorId) {
        throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
      }
      if (invoice.inspectorId !== actor.inspectorId) {
        throw new InvoiceNotFoundError();
      }
    } else {
      throw new ForbiddenError('FORBIDDEN', 'You do not have permission to download invoices');
    }

    // 3. Check isReady
    if (!invoice.isReady()) {
      throw new InvoiceNotReadyError();
    }

    // 4. Check hasFile
    if (!invoice.hasFile()) {
      throw new InvoiceFileNotGeneratedError();
    }

    const downloadUrl = await this.storageService.generatePresignedGetUrl(
      invoice.fileKey!,
      PRESIGNED_URL_TTL_SECONDS,
    );
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + PRESIGNED_URL_TTL_SECONDS);

    return {
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
