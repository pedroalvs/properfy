import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import {
  InvoiceNotFoundError,
  InvoiceNotPendingReviewError,
} from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface RejectDraftInvoiceInput {
  invoiceId: string;
  reason: string;
  actor: AuthContext;
}

export interface RejectDraftInvoiceOutput {
  invoiceId: string;
  status: 'DELETED';
}

export class RejectDraftInvoiceUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: RejectDraftInvoiceInput): Promise<RejectDraftInvoiceOutput> {
    const { invoiceId, reason, actor } = input;

    // 1. Validate actor role (AM/OP only)
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'financial.reject_draft_invoice',
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
    });

    // 2. Load invoice
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError();
    }

    // 3. Check status must be PENDING_REVIEW
    if (invoice.status !== 'PENDING_REVIEW') {
      throw new InvoiceNotPendingReviewError();
    }

    // 4. Audit BEFORE delete
    this.auditService.log({
      action: 'inspector_invoice.draft_rejected',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
      after: {
        inspectorId: invoice.inspectorId,
        invoiceId,
        draftedByInspectorId: invoice.draftedByInspectorId,
        rejectedByUserId: actor.userId,
        reason,
      },
    });

    // 5. Delete invoice
    await this.invoiceRepo.deleteById(invoiceId);

    return {
      invoiceId,
      status: 'DELETED',
    };
  }
}
