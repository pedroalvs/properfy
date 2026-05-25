import type { AuditService } from '../../../../shared/infrastructure/audit';

/**
 * DraftInspectorInvoiceUseCase — Feature 010 billing domain, created as part of 008 delivery.
 * When 010 is later planned/implemented, its tasks.md MUST reference this as already-delivered.
 *
 * Aggregates approved INSPECTOR_PAYOUT financial entries for a given inspector + period,
 * creates an InspectorInvoice in PENDING_REVIEW status, checks period overlap, emits audit.
 */

export interface DraftInvoiceInput {
  inspectorId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
}

export interface DraftInvoiceOutput {
  invoiceId: string;
  inspectorId: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  currency: string;
  status: string;
  entryCount: number;
}

export class DraftInspectorInvoiceUseCase {
  constructor(
    private readonly prisma: any, // PrismaClient — using any to avoid circular dependency
    private readonly auditService: AuditService,
  ) {}

  async execute(input: DraftInvoiceInput): Promise<DraftInvoiceOutput> {
    const { inspectorId, periodStart, periodEnd } = input;
    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    // 1. Check period overlap with existing non-rejected invoices
    const overlapping = await this.prisma.inspectorInvoice.findFirst({
      where: {
        inspector_id: inspectorId,
        status: { notIn: ['SUPERSEDED', 'PENDING_REVIEW'] },
        OR: [
          { period_start: { lte: end }, period_end: { gte: start } },
        ],
      },
    });

    if (overlapping) {
      const { DomainError } = await import('../../../../shared/domain/errors');
      throw new DomainError('INVOICE_PERIOD_OVERLAP', 'An invoice already exists for an overlapping period');
    }

    // 2. Aggregate approved INSPECTOR_PAYOUT entries in the period
    const entries = await this.prisma.financialEntry.findMany({
      where: {
        inspector_id: inspectorId,
        entry_type: 'INSPECTOR_PAYOUT',
        status: 'APPROVED',
        effective_at: { gte: start, lte: end },
      },
      select: { id: true, amount: true, currency: true },
    });

    if (entries.length === 0) {
      const { DomainError } = await import('../../../../shared/domain/errors');
      throw new DomainError('INVOICE_EMPTY_PERIOD', 'No approved payout entries found in the specified period');
    }

    // 3. Compute total
    const totalAmount = entries.reduce((sum: number, e: { amount: any }) => sum + Number(e.amount), 0);
    const currency = entries[0]?.currency ?? 'AUD';

    // 4. Supersede any existing PENDING_REVIEW invoice for the same period before creating
    await this.prisma.inspectorInvoice.updateMany({
      where: {
        inspector_id: inspectorId,
        status: 'PENDING_REVIEW',
        OR: [
          { period_start: { lte: end }, period_end: { gte: start } },
        ],
      },
      data: { status: 'SUPERSEDED' },
    });

    // 5. Create invoice in PENDING_REVIEW
    const invoiceId = crypto.randomUUID();
    await this.prisma.inspectorInvoice.create({
      data: {
        id: invoiceId,
        inspector_id: inspectorId,
        period_start: start,
        period_end: end,
        period_type: 'BIWEEKLY', // Default — can be parameterized later
        status: 'PENDING_REVIEW',
        total_amount: totalAmount,
        currency,
        drafted_by_inspector_id: inspectorId,
      },
    });

    // 6. Audit
    this.auditService.log({
      action: 'inspector_invoice.drafted',
      actorType: 'USER',
      entityType: 'inspector_invoice',
      entityId: invoiceId,
      metadata: {
        inspectorId,
        periodStart,
        periodEnd,
        totalAmount,
        entryIds: entries.map((e: { id: string }) => e.id),
      },
    });

    return {
      invoiceId,
      inspectorId,
      periodStart,
      periodEnd,
      totalAmount,
      currency,
      status: 'PENDING_REVIEW',
      entryCount: entries.length,
    };
  }
}
