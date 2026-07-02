import { randomUUID } from 'crypto';
import type { IInspectorRepository } from '../../../inspector/domain/inspector.repository';
import type { IFinancialEntryRepository } from '../../domain/financial-entry.repository';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import { InspectorInvoiceEntity } from '../../domain/inspector-invoice.entity';
import { SystemClock, type Clock } from '../../../../shared/domain/clock';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import {
  InspectorNotFoundError,
  InvoiceActiveExistsError,
  InvoiceEmptyPeriodError,
  InvoiceMixedCurrencyError,
  InvoicePeriodNotAlignedError,
  InvoicePeriodNotClosedError,
} from '../../domain/billing.errors';
import {
  isCycleAligned,
  isPeriodClosed,
  periodDateColumns,
  periodEffectiveRange,
} from '../../domain/billing-period.service';

export interface RequestInvoiceInput {
  inspectorId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
}

export interface RequestInvoiceOutput {
  invoiceId: string;
  inspectorId: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalAmount: number;
  currency: string;
  payoutCount: number;
}

/**
 * Inspector requests an invoice for a system-computed closed, cycle-aligned period (spec 032).
 * Creates a PENDING_REVIEW invoice (no number, no snapshot, no PDF). The route restricts this to
 * the authenticated inspector (own-only).
 *
 * Validations: period must be closed and cycle-aligned; there must be ≥1 approved payout; payouts
 * must share one currency; and no ACTIVE invoice may already exist for the (inspector, period).
 */
export class RequestInvoiceUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly financialEntryRepo: IFinancialEntryRepository,
    private readonly inspectorRepo: IInspectorRepository,
    private readonly auditService: AuditService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(input: RequestInvoiceInput): Promise<RequestInvoiceOutput> {
    const { inspectorId, periodStart, periodEnd } = input;

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector) {
      throw new InspectorNotFoundError();
    }
    const cycle = inspector.effectiveBillingCycle;

    // 1. Period must be cycle-aligned and fully closed.
    if (!isCycleAligned(cycle, periodStart, periodEnd)) {
      throw new InvoicePeriodNotAlignedError();
    }
    if (!isPeriodClosed(periodEnd, this.clock.now())) {
      throw new InvoicePeriodNotClosedError();
    }

    // 2. Aggregate approved payouts; require ≥1 and a single currency.
    const { from, to } = periodEffectiveRange(periodStart, periodEnd);
    const agg = await this.financialEntryRepo.aggregateApprovedPayoutsForInspectorInPeriod(inspectorId, from, to);
    if (agg.count === 0) {
      throw new InvoiceEmptyPeriodError();
    }
    if (agg.currencies.length > 1) {
      throw new InvoiceMixedCurrencyError(agg.currencies);
    }
    const currency = agg.currencies[0];
    if (!currency) {
      // count > 0 guarantees a currency; defensive narrowing for the type system.
      throw new InvoiceEmptyPeriodError();
    }

    // 3. No ACTIVE invoice may exist for the exact period.
    const { start, end } = periodDateColumns(periodStart, periodEnd);
    const existingActive = await this.invoiceRepo.findActiveByInspectorAndPeriod(inspectorId, start, end);
    if (existingActive) {
      throw new InvoiceActiveExistsError();
    }

    // 4. Create the PENDING_REVIEW invoice (no number / snapshot / PDF yet).
    const now = this.clock.now();
    const invoiceId = randomUUID();
    const invoice = new InspectorInvoiceEntity({
      id: invoiceId,
      invoiceNumber: null,
      inspectorId,
      inspectorName: null,
      periodStart: start,
      periodEnd: end,
      periodType: cycle,
      status: 'PENDING_REVIEW',
      totalAmount: agg.totalAmount,
      currency,
      lineItemsSnapshot: null,
      fileKey: null,
      generatedByUserId: null,
      issuedAt: null,
      paidAt: null,
      paidByUserId: null,
      paymentReference: null,
      notes: null,
      draftedByInspectorId: inspectorId,
      createdAt: now,
      updatedAt: now,
    });
    try {
      await this.invoiceRepo.save(invoice);
    } catch (err) {
      // A concurrent request can insert the same active (inspector, period) between the findActive
      // check above and this save; the partial unique index is the backstop. Surface it as the clean
      // domain conflict rather than a 500. (duck-typed to keep the application layer Prisma-free)
      // Narrow to the active-period index so any OTHER unique violation still surfaces as a genuine
      // integrity error instead of being mislabelled "active invoice exists".
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'P2002') {
        const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? '');
        if (target.includes('period') || target.includes('active')) {
          throw new InvoiceActiveExistsError();
        }
      }
      throw err;
    }

    this.auditService.log({
      action: 'inspector_invoice.requested',
      actorType: 'USER',
      entityType: 'InspectorInvoice',
      entityId: invoiceId,
      metadata: { inspectorId, periodStart, periodEnd, periodType: cycle, totalAmount: agg.totalAmount, currency, payoutCount: agg.count },
    });

    return {
      invoiceId,
      inspectorId,
      periodType: cycle,
      periodStart,
      periodEnd,
      status: 'PENDING_REVIEW',
      totalAmount: agg.totalAmount,
      currency,
      payoutCount: agg.count,
    };
  }
}
