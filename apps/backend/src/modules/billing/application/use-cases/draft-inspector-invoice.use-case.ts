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

    // 1. Check period overlap with existing invoices.
    //    SUPERSEDED rows are always ignored (historical artefacts).
    //    PENDING_REVIEW for the EXACT same period is allowed — the upsert below will
    //    refresh it in place. PENDING_REVIEW for a DIFFERENT overlapping period must
    //    still block the draft to prevent double-counting inspector payouts.
    const overlapping = await this.prisma.inspectorInvoice.findFirst({
      where: {
        inspector_id: inspectorId,
        status: { notIn: ['SUPERSEDED'] },
        NOT: { period_start: start, period_end: end },
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

    // 4. Upsert: the unique constraint on (inspector_id, period_start, period_end) is
    //    status-agnostic, so a separate supersede-then-insert would hit a constraint
    //    violation. Instead, upsert refreshes any existing row for this exact period
    //    (SUPERSEDED or PENDING_REVIEW) back to PENDING_REVIEW with updated amounts,
    //    or creates a new row when none exists.
    const newId = crypto.randomUUID();
    const upserted = await this.prisma.inspectorInvoice.upsert({
      where: {
        inspector_id_period_start_period_end: {
          inspector_id: inspectorId,
          period_start: start,
          period_end: end,
        },
      },
      update: {
        status: 'PENDING_REVIEW',
        total_amount: totalAmount,
        currency,
        drafted_by_inspector_id: inspectorId,
      },
      create: {
        id: newId,
        inspector_id: inspectorId,
        period_start: start,
        period_end: end,
        period_type: 'BIWEEKLY',
        status: 'PENDING_REVIEW',
        total_amount: totalAmount,
        currency,
        drafted_by_inspector_id: inspectorId,
      },
      select: { id: true },
    });
    const invoiceId = upserted.id;

    // 5. Audit
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
