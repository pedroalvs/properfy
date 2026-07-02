import type { AuthContext } from '@properfy/shared';
import { formatInvoiceNumber } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import {
  InvoiceNotFoundError,
  InvoiceNotPendingReviewError,
  InvoiceEmptyPeriodError,
  InvoiceMixedCurrencyError,
} from '../../domain/billing.errors';
import { periodEffectiveRange } from '../../domain/billing-period.service';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface ApproveDraftInvoiceInput {
  invoiceId: string;
  actor: AuthContext;
}

export interface ApproveDraftInvoiceOutput {
  id: string;
  invoiceNumber: number;
  invoiceNumberDisplay: string;
  status: 'CLOSED';
  generatedByUserId: string;
  issuedAt: string;
}

/**
 * Approves a PENDING_REVIEW invoice (AM/OP): freezes the line-item snapshot, total and inspector
 * name, assigns the sequential number, stamps issued_at, and enqueues the PDF job (spec 032).
 * The snapshot is built from the current approved INSPECTOR_PAYOUT ledger — the invoice never
 * mutates the ledger and, once emitted, never recalculates.
 */
export class ApproveDraftInvoiceUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly financialEntryRepo: IFinancialEntryRepository,
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

    // 2. Load invoice, require PENDING_REVIEW.
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError();
    }
    if (invoice.status !== 'PENDING_REVIEW') {
      throw new InvoiceNotPendingReviewError();
    }

    // 3. Re-read the ledger and validate (payouts may have changed since the request).
    const fromStr = invoice.periodStart.toISOString().slice(0, 10);
    const toStr = invoice.periodEnd.toISOString().slice(0, 10);
    const { from, to } = periodEffectiveRange(fromStr, toStr);

    const agg = await this.financialEntryRepo.aggregateApprovedPayoutsForInspectorInPeriod(invoice.inspectorId, from, to);
    if (agg.count === 0) {
      throw new InvoiceEmptyPeriodError();
    }
    if (agg.currencies.length > 1) {
      throw new InvoiceMixedCurrencyError(agg.currencies);
    }

    // 4. Build the snapshot to freeze.
    const snapshot = await this.financialEntryRepo.findApprovedPayoutLinesForSnapshot(invoice.inspectorId, from, to);
    const totalAmount = snapshot.reduce((sum, line) => sum + line.amount, 0);

    // 5. Atomically transition PENDING_REVIEW → CLOSED, assign number, freeze snapshot.
    const now = new Date();
    const assignedNumber = await this.invoiceRepo.assignNumberAndFreeze(invoiceId, {
      lineItemsSnapshot: snapshot,
      totalAmount,
      inspectorName: invoice.inspectorName,
      issuedAt: now,
      generatedByUserId: actor.userId,
    });
    if (assignedNumber === null) {
      // Lost an approval race — another operator already approved it.
      throw new InvoiceNotPendingReviewError();
    }

    // 6. Enqueue idempotent PDF generation.
    await this.jobQueue.enqueue('billing.generate-invoice-file', { invoiceId });

    // 7. Audit.
    this.auditService.log({
      action: 'inspector_invoice.approved',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
      after: {
        inspectorId: invoice.inspectorId,
        invoiceId,
        invoiceNumber: assignedNumber,
        draftedByInspectorId: invoice.draftedByInspectorId,
        approvedByUserId: actor.userId,
        totalAmount,
        lineCount: snapshot.length,
      },
    });

    return {
      id: invoiceId,
      invoiceNumber: assignedNumber,
      invoiceNumberDisplay: formatInvoiceNumber(assignedNumber)!,
      status: 'CLOSED',
      generatedByUserId: actor.userId,
      issuedAt: now.toISOString(),
    };
  }
}
