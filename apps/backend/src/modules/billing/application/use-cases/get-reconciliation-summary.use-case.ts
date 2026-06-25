import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import { MultiCurrencyScopeError } from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

export interface GetReconciliationSummaryInput {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  inspectorId?: string;
  actor: AuthContext;
}

export interface GetReconciliationSummaryOutput {
  from: string;
  to: string;
  inspectorId: string | null;
  currency: string;
  totalInvoicedAmount: number;
  totalPaidAmount: number;
  totalUnpaidAmount: number;
  paidCount: number;
  unpaidCount: number;
}

/**
 * Aggregated reconciliation view for a date range.
 *
 * Per FR-014 / FR-015 / FR-015a and Q1/Q2 clarifications:
 * - The date range filters on the invoice `generatedAt` column
 * - Only CLOSED and PAID invoices are included
 * - If the scope contains more than one currency, throws MultiCurrencyScopeError
 *   (caller gets a 400 MULTI_CURRENCY_SCOPE and must narrow filters)
 * - Invariant: totalInvoicedAmount === totalPaidAmount + totalUnpaidAmount
 */
export class GetReconciliationSummaryUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetReconciliationSummaryInput): Promise<GetReconciliationSummaryOutput> {
    const { actor } = input;

    // 1. Role gate
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'financial.reconciliation_summary',
      entityType: 'InspectorInvoice',
    });

    // 2. Parse dates — `from` is inclusive lower bound (start of day), `to` is inclusive upper bound (end of day)
    const fromDate = new Date(`${input.from}T00:00:00.000Z`);
    const toDate = new Date(`${input.to}T23:59:59.999Z`);

    // 3. Fetch aggregates from the repository
    const rows = await this.invoiceRepo.getReconciliationAggregates({
      from: fromDate,
      to: toDate,
      inspectorId: input.inspectorId,
    });

    // 4. Detect multi-currency scope (Q2 clarification: error instead of summing)
    const distinctCurrencies = Array.from(new Set(rows.map((r) => r.currency)));
    if (distinctCurrencies.length > 1) {
      throw new MultiCurrencyScopeError(distinctCurrencies);
    }

    // 5. Aggregate by status. Default currency for empty scopes is 'AUD'.
    const currency = distinctCurrencies[0] ?? 'AUD';
    let totalPaidAmount = 0;
    let totalUnpaidAmount = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    for (const row of rows) {
      if (row.status === 'PAID') {
        totalPaidAmount += row.sumAmount;
        paidCount += row.count;
      } else if (row.status === 'CLOSED') {
        totalUnpaidAmount += row.sumAmount;
        unpaidCount += row.count;
      }
    }

    return {
      from: input.from,
      to: input.to,
      inspectorId: input.inspectorId ?? null,
      currency,
      totalInvoicedAmount: totalPaidAmount + totalUnpaidAmount,
      totalPaidAmount,
      totalUnpaidAmount,
      paidCount,
      unpaidCount,
    };
  }
}
