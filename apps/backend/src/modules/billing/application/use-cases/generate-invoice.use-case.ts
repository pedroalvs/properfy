import { randomUUID } from 'crypto';
import type { AuthContext, BillingPeriodType, InspectorInvoiceStatus } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import { InspectorInvoiceEntity } from '../../domain/inspector-invoice.entity';
import { InvoicePeriodOverlapError } from '../../domain/billing.errors';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';

export interface GenerateInvoiceInput {
  inspectorId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  periodType?: BillingPeriodType; // defaults to 'BIWEEKLY'
  currency?: string; // defaults to 'AUD'
  actor: AuthContext;
}

export interface GenerateInvoiceOutput {
  id: string;
  inspectorId: string;
  periodStart: string;
  periodEnd: string;
  periodType: BillingPeriodType;
  status: InspectorInvoiceStatus;
  totalAmount: number;
  currency: string;
  fileKey: string | null;
  generatedByUserId: string | null;
  generatedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export class GenerateInvoiceUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly auditService: AuditService,
    private readonly jobQueue?: IJobQueue,
  ) {}

  async execute(input: GenerateInvoiceInput): Promise<GenerateInvoiceOutput> {
    const { inspectorId, periodStart, periodEnd, actor } = input;

    // 1. Validate role AM/OP
    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('FORBIDDEN', 'Only AM or OP can generate invoices');
    }

    const startDate = parseDateOnly(periodStart);
    const endDate = parseDateOnly(periodEnd);

    // 2. Check exact match (idempotent)
    const existing = await this.invoiceRepo.findByInspectorAndPeriod(inspectorId, startDate, endDate);
    if (existing) {
      return {
        id: existing.id,
        inspectorId: existing.inspectorId,
        periodStart: formatDate(existing.periodStart),
        periodEnd: formatDate(existing.periodEnd),
        periodType: existing.periodType,
        status: existing.status,
        totalAmount: Number(existing.totalAmount),
        currency: existing.currency,
        fileKey: existing.fileKey,
        generatedByUserId: existing.generatedByUserId,
        generatedAt: existing.generatedAt?.toISOString() ?? null,
        paidAt: existing.paidAt?.toISOString() ?? null,
        notes: existing.notes,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
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
      endOfDay(endDate),
    );

    // 5. Create entity
    const now = new Date();
    const invoiceId = randomUUID();
    const invoice = new InspectorInvoiceEntity({
      id: invoiceId,
      inspectorId,
      periodStart: startDate,
      periodEnd: endDate,
      periodType: input.periodType ?? 'BIWEEKLY',
      status: 'CLOSED',
      totalAmount,
      currency: input.currency ?? 'AUD',
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
        totalAmount: Number(totalAmount),
        currency: input.currency ?? 'AUD',
      },
    });

    // Enqueue file generation job
    if (this.jobQueue) {
      await this.jobQueue.enqueue('billing.generate-invoice-file', { invoiceId });
    }

    return {
      id: invoiceId,
      inspectorId,
      periodStart: formatDate(invoice.periodStart),
      periodEnd: formatDate(invoice.periodEnd),
      periodType: invoice.periodType,
      status: invoice.status,
      totalAmount: Number(totalAmount),
      currency: input.currency ?? 'AUD',
      fileKey: invoice.fileKey,
      generatedByUserId: invoice.generatedByUserId,
      generatedAt: invoice.generatedAt?.toISOString() ?? null,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      notes: invoice.notes,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
    };
  }
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfDay(value: Date): Date {
  const end = new Date(value);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
