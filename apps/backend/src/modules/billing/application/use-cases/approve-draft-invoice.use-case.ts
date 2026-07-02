import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import {
  InvoiceNotFoundError,
  InvoiceNotPendingReviewError,
} from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface ApproveDraftInvoiceInput {
  invoiceId: string;
  actor: AuthContext;
}

export interface ApproveDraftInvoiceOutput {
  id: string;
  status: 'CLOSED';
  generatedByUserId: string;
  issuedAt: string;
}

export class ApproveDraftInvoiceUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly jobQueue: IJobQueue,
  ) {}

  async execute(input: ApproveDraftInvoiceInput): Promise<ApproveDraftInvoiceOutput> {
    const { invoiceId, actor } = input;

    // 1. Validate actor role (AM/OP only)
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'financial.approve_draft_invoice',
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

    // 4. Transition to CLOSED
    const now = new Date();
    await this.invoiceRepo.update(invoiceId, {
      status: 'CLOSED',
      generatedByUserId: actor.userId,
      issuedAt: now,
    });

    // 5. Enqueue file generation
    await this.jobQueue.enqueue('billing.generate-invoice-file', { invoiceId });

    // 6. Audit log
    this.auditService.log({
      action: 'inspector_invoice.approved',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
      after: {
        inspectorId: invoice.inspectorId,
        invoiceId,
        draftedByInspectorId: invoice.draftedByInspectorId,
        approvedByUserId: actor.userId,
      },
    });

    return {
      id: invoiceId,
      status: 'CLOSED',
      generatedByUserId: actor.userId,
      issuedAt: now.toISOString(),
    };
  }
}
