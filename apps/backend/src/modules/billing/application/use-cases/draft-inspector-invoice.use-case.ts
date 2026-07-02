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

    // 4. Refresh any existing row for this exact period back to PENDING_REVIEW with updated
    //    amounts, or create a new one. (Legacy free-form draft flow, retained until the PWA
    //    switches to the closed-period request flow. Uses findFirst + update/create rather than a
    //    composite-key upsert so it no longer depends on the status-agnostic composite unique,
    //    which is replaced by an ACTIVE-only partial unique index.)
    const existing = await this.prisma.inspectorInvoice.findFirst({
      where: { inspector_id: inspectorId, period_start: start, period_end: end },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    });
    let invoiceId: string;
    if (existing) {
      await this.prisma.inspectorInvoice.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING_REVIEW',
          total_amount: totalAmount,
          currency,
          drafted_by_inspector_id: inspectorId,
        },
      });
      invoiceId = existing.id;
    } else {
      const created = await this.prisma.inspectorInvoice.create({
        data: {
          id: crypto.randomUUID(),
          inspector_id: inspectorId,
          period_start: start,
          period_end: end,
          period_type: 'FORTNIGHTLY',
          status: 'PENDING_REVIEW',
          total_amount: totalAmount,
          currency,
          drafted_by_inspector_id: inspectorId,
        },
        select: { id: true },
      });
      invoiceId = created.id;
    }

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
