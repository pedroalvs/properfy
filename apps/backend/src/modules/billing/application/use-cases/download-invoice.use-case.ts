import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import {
  InvoiceNotFoundError,
  InvoiceNotReadyError,
  InvoiceFileNotGeneratedError,
} from '../../domain/billing.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';

export interface DownloadInvoiceInput {
  invoiceId: string;
  actor: AuthContext;
}

export interface DownloadInvoiceOutput {
  downloadUrl: string;
  expiresAt: string;
}

export class DownloadInvoiceUseCase {
  constructor(private readonly invoiceRepo: IInspectorInvoiceRepository) {}

  async execute(input: DownloadInvoiceInput): Promise<DownloadInvoiceOutput> {
    const { invoiceId, actor } = input;

    // 1. Load invoice
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError();
    }

    // 2. Scope check
    if (actor.role === 'AM' || actor.role === 'OP') {
      // Full access
    } else if (actor.role === 'INSP') {
      if (invoice.inspectorId !== actor.userId) {
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

    // 5. Generate stub presigned URL
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

    return {
      downloadUrl: `https://stub-storage/billing-documents/invoices/${invoice.inspectorId}/${invoice.id}.xlsx?token=stub-presigned-token`,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
