import type { AuthContext } from '@properfy/shared';
import type { IInspectorInvoiceRepository } from '../../domain/inspector-invoice.repository';
import { MultiCurrencyScopeError } from '../../domain/billing.errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';

export interface GetInvoiceSummaryInput {
  inspectorId?: string;
  agencyId?: string;
  branchId?: string;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
  actor: AuthContext;
}

export interface GetInvoiceSummaryOutput {
  currency: string;
  totalCount: number;
  pendingCount: number;
  /** CLOSED only — PAID is reported separately. */
  approvedCount: number;
  paidCount: number;
  voidCount: number;
  pendingAmount: number;
  paidAmount: number;
}

/**
 * Per-status indicator aggregates for the backoffice Invoices page. Unlike the reconciliation
 * summary, all statuses are included and every filter is optional; filters mirror the invoice
 * list (inspector, agency/branch content filters, period_start date range). Multi-currency scopes
 * throw MultiCurrencyScopeError (400 MULTI_CURRENCY_SCOPE) instead of summing across currencies.
 */
export class GetInvoiceSummaryUseCase {
  constructor(
    private readonly invoiceRepo: IInspectorInvoiceRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetInvoiceSummaryInput): Promise<GetInvoiceSummaryOutput> {
    const { actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'financial.invoice_summary',
      entityType: 'InspectorInvoice',
    });

    const rows = await this.invoiceRepo.getStatusAggregates({
      inspectorId: input.inspectorId,
      agencyId: input.agencyId,
      branchId: input.branchId,
      from: input.fromDate ? new Date(`${input.fromDate}T00:00:00.000Z`) : undefined,
      to: input.toDate ? new Date(`${input.toDate}T23:59:59.999Z`) : undefined,
    });

    const distinctCurrencies = Array.from(new Set(rows.map((r) => r.currency)));
    if (distinctCurrencies.length > 1) {
      throw new MultiCurrencyScopeError(distinctCurrencies);
    }

    const currency = distinctCurrencies[0] ?? 'AUD';
    const summary: GetInvoiceSummaryOutput = {
      currency,
      totalCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      paidCount: 0,
      voidCount: 0,
      pendingAmount: 0,
      paidAmount: 0,
    };

    for (const row of rows) {
      summary.totalCount += row.count;
      switch (row.status) {
        case 'PENDING_REVIEW':
          summary.pendingCount += row.count;
          summary.pendingAmount += row.sumAmount;
          break;
        case 'CLOSED':
          summary.approvedCount += row.count;
          break;
        case 'PAID':
          summary.paidCount += row.count;
          summary.paidAmount += row.sumAmount;
          break;
        case 'VOID':
          summary.voidCount += row.count;
          break;
      }
    }

    return summary;
  }
}
