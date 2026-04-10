import type { ReconciliationSummaryResponse } from '@properfy/shared';
import type { MultiCurrencyScopeError } from '../hooks/useReconciliationSummary';

interface StatCardProps {
  label: string;
  value: string;
  color: string;
  isLoading?: boolean;
}

function StatCard({ label, value, color, isLoading }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded bg-card-bg p-4 shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </span>
      {isLoading ? (
        <div className="h-6 w-24 animate-pulse rounded bg-black/10" />
      ) : (
        <span className="text-lg font-bold" style={{ color }}>
          {value}
        </span>
      )}
    </div>
  );
}

interface ReconciliationSummaryProps {
  summary: ReconciliationSummaryResponse | null;
  isLoading?: boolean;
  multiCurrencyError?: MultiCurrencyScopeError | null;
}

function formatAmount(value: number, currency: string | undefined): string {
  if (!currency) return '—';
  return value.toLocaleString('en-AU', { style: 'currency', currency });
}

export function ReconciliationSummary({
  summary,
  isLoading = false,
  multiCurrencyError = null,
}: ReconciliationSummaryProps) {
  if (multiCurrencyError) {
    return (
      <div
        className="mb-4 rounded border border-info/40 bg-info/10 px-4 py-3 text-sm text-text-primary"
        data-testid="reconciliation-multi-currency-banner"
        role="status"
      >
        <p className="font-semibold">Multiple currencies in scope</p>
        <p className="mt-1">
          The selected filters returned invoices in more than one currency
          {multiCurrencyError.currencies.length > 0
            ? ` (${multiCurrencyError.currencies.join(', ')})`
            : ''}
          . Narrow the filters (for example, by inspector) to obtain a coherent summary.
        </p>
      </div>
    );
  }

  const currency = summary?.currency;

  return (
    <div
      className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5"
      data-testid="reconciliation-summary"
    >
      <StatCard
        label="Total Invoiced"
        value={formatAmount(summary?.totalInvoicedAmount ?? 0, currency)}
        color="var(--color-text-primary)"
        isLoading={isLoading}
      />
      <StatCard
        label="Total Paid"
        value={formatAmount(summary?.totalPaidAmount ?? 0, currency)}
        color="var(--color-money-positive)"
        isLoading={isLoading}
      />
      <StatCard
        label="Total Unpaid"
        value={formatAmount(summary?.totalUnpaidAmount ?? 0, currency)}
        color="var(--color-warning)"
        isLoading={isLoading}
      />
      <StatCard
        label="Paid Invoices"
        value={String(summary?.paidCount ?? 0)}
        color="var(--color-money-positive)"
        isLoading={isLoading}
      />
      <StatCard
        label="Unpaid Invoices"
        value={String(summary?.unpaidCount ?? 0)}
        color="var(--color-warning)"
        isLoading={isLoading}
      />
    </div>
  );
}
