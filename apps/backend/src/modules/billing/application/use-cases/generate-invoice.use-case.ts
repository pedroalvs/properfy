import { randomUUID } from 'crypto';
import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import { InspectorInvoiceEntity } from '../../domain/inspector-invoice.entity';
import { InvoicePeriodOverlapError } from '../../domain/billing.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface GenerateInvoiceInput {
  inspectorId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  actor: AuthContext;
}

export interface GenerateInvoiceOutput {
  invoiceId: string;
  status: 'CLOSED';
  totalAmount: string;
  currency: string;
  message: string;
}

export class GenerateInvoiceUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: GenerateInvoiceInput): Promise<GenerateInvoiceOutput> {
    const { inspectorId, periodStart, periodEnd, actor } = input;

    // 1. Validate role AM/OP
    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('FORBIDDEN', 'Only AM or OP can generate invoices');
    }

    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);

    // 2. Check exact match (idempotent)
    const existing = await this.invoiceRepo.findByInspectorAndPeriod(inspectorId, startDate, endDate);
    if (existing) {
      return {
        invoiceId: existing.id,
        status: 'CLOSED',
        totalAmount: existing.totalAmount.toString(),
        currency: existing.currency,
        message: 'Invoice generation queued. File will be available shortly.',
      };
    }

    // 3. Check overlapping
    const overlapping = await this.invoiceRepo.findOverlapping(inspectorId, startDate, endDate);
    if (overlapping) {
      throw new InvoicePeriodOverlapError();
    }

    // 4. Sum approved payouts
    const totalAmount = await this.financialEntryRepo.sumApprovedPayoutsForInspectorInPeriod(
      inspectorId,
      startDate,
      endDate,
    );

    // 5. Create entity
    const now = new Date();
    const invoiceId = randomUUID();
    const invoice = new InspectorInvoiceEntity({
      id: invoiceId,
      inspectorId,
      periodStart: startDate,
      periodEnd: endDate,
      periodType: 'BIWEEKLY',
      status: 'CLOSED',
      totalAmount,
      currency: 'AUD',
      fileKey: null,
      generatedByUserId: actor.userId,
      generatedAt: now,
      paidAt: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    // 6. Save
    await this.invoiceRepo.save(invoice);

    // 7. Audit log
    this.auditService.log({
      action: 'invoice.generated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
      after: {
        inspectorId,
        periodStart,
        periodEnd,
        status: 'CLOSED',
        totalAmount: totalAmount.toString(),
        currency: 'AUD',
      },
    });

    return {
      invoiceId,
      status: 'CLOSED',
      totalAmount: totalAmount.toString(),
      currency: 'AUD',
      message: 'Invoice generation queued. File will be available shortly.',
    };
  }
}
