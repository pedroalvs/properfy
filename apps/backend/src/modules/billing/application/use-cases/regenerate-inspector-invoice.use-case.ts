import { randomUUID } from 'crypto';
import type { AuthContext, InspectorInvoiceStatus } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import { InspectorInvoiceEntity } from '../../domain/inspector-invoice.entity';
import { InvoiceNotFoundError, InvoiceNotRegenerableError } from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface RegenerateInspectorInvoiceInput {
  invoiceId: string;
  reason?: string;
  actor: AuthContext;
}

export interface RegenerateInspectorInvoiceOutput {
  id: string;
  inspectorId: string;
  periodStart: string;
  periodEnd: string;
  periodType: string;
  status: InspectorInvoiceStatus;
  totalAmount: number;
  currency: string;
  fileKey: string | null;
  previousInvoiceId: string | null;
  generatedByUserId: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export class RegenerateInspectorInvoiceUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly jobQueue?: IJobQueue,
    private readonly authorizationService?: AuthorizationService,
  ) {}

  async execute(input: RegenerateInspectorInvoiceInput): Promise<RegenerateInspectorInvoiceOutput> {
    const { invoiceId, reason, actor } = input;

    // 1. Validate role - AM only
    this.authorizationService?.assertRoles(actor, ['AM'], { action: 'financial.regenerate_invoice', entityType: 'InspectorInvoice' });

    // 2. Load existing invoice
    const existing = await this.invoiceRepo.findById(invoiceId);
    if (!existing) {
      throw new InvoiceNotFoundError();
    }

    // 3. Validate status is CLOSED or PAID
    if (!existing.canBeRegenerated()) {
      throw new InvoiceNotRegenerableError();
    }

    // 4. Recalculate totals from current approved entries
    const totalAmount = await this.financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod(
      existing.inspectorId,
      existing.periodStart,
      endOfDay(existing.periodEnd),
    );

    // 5. Create new invoice
    const now = new Date();
    const newInvoiceId = randomUUID();
    const newInvoice = new InspectorInvoiceEntity({
      id: newInvoiceId,
      invoiceNumber: null,
      inspectorId: existing.inspectorId,
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      periodType: existing.periodType,
      status: 'CLOSED',
      totalAmount,
      currency: existing.currency,
      lineItemsSnapshot: null,
      fileKey: null,
      previousInvoiceId: invoiceId,
      generatedByUserId: actor.userId,
      issuedAt: now,
      paidAt: null,
      paidByUserId: null,
      paymentReference: null,
      notes: reason ?? null,
      draftedByInspectorId: null,
      createdAt: now,
      updatedAt: now,
    });

    await this.invoiceRepo.save(newInvoice);

    // 6. Mark old invoice as SUPERSEDED and link to new
    await this.invoiceRepo.update(invoiceId, {
      status: 'SUPERSEDED',
    });

    // 7. Audit log
    this.auditService.log({
      action: 'invoice.regenerated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectorInvoice',
      entityId: newInvoiceId,
      reason,
      before: {
        previousInvoiceId: invoiceId,
        previousTotalAmount: Number(existing.totalAmount),
        previousStatus: existing.status,
      },
      after: {
        status: 'CLOSED',
        totalAmount: Number(totalAmount),
        currency: existing.currency,
      },
    });

    // 8. Enqueue file generation
    if (this.jobQueue) {
      await this.jobQueue.enqueue('billing.generate-invoice-file', { invoiceId: newInvoiceId });
    }

    return {
      id: newInvoiceId,
      inspectorId: existing.inspectorId,
      periodStart: formatDate(existing.periodStart),
      periodEnd: formatDate(existing.periodEnd),
      periodType: newInvoice.periodType,
      status: newInvoice.status,
      totalAmount: Number(totalAmount),
      currency: existing.currency,
      fileKey: newInvoice.fileKey,
      previousInvoiceId: invoiceId,
      generatedByUserId: newInvoice.generatedByUserId,
      issuedAt: newInvoice.issuedAt?.toISOString() ?? null,
      paidAt: newInvoice.paidAt?.toISOString() ?? null,
      notes: newInvoice.notes,
      createdAt: newInvoice.createdAt.toISOString(),
      updatedAt: newInvoice.updatedAt.toISOString(),
    };
  }
}

function endOfDay(value: Date): Date {
  const end = new Date(value);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
