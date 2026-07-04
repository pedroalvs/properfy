import type { InvoiceSummaryResponse } from '@properfy/shared';
import type { MultiCurrencyScopeError } from '../types';

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

interface InvoiceSummaryIndicatorsProps {
  summary: InvoiceSummaryResponse | null;
  isLoading?: boolean;
  multiCurrencyError?: MultiCurrencyScopeError | null;
}

function formatAmount(value: number, currency: string | undefined): string {
  if (!currency) return '—';
  return value.toLocaleString('en-AU', { style: 'currency', currency });
}

export function InvoiceSummaryIndicators({
  summary,
  isLoading = false,
  multiCurrencyError = null,
}: InvoiceSummaryIndicatorsProps) {
  if (multiCurrencyError) {
    return (
      <div
        className="mb-4 rounded border border-info/40 bg-info/10 px-4 py-3 text-sm text-text-primary"
        data-testid="invoice-summary-multi-currency-banner"
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
      data-testid="invoice-summary-indicators"
    >
      <StatCard
        label="Pending"
        value={String(summary?.pendingCount ?? 0)}
        color="var(--color-warning)"
        isLoading={isLoading}
      />
      <StatCard
        label="Approved"
        value={String(summary?.approvedCount ?? 0)}
        color="var(--color-success)"
        isLoading={isLoading}
      />
      <StatCard
        label="Total"
        value={String(summary?.totalCount ?? 0)}
        color="var(--color-text-primary)"
        isLoading={isLoading}
      />
      <StatCard
        label="Pending Amount"
        value={formatAmount(summary?.pendingAmount ?? 0, currency)}
        color="var(--color-warning)"
        isLoading={isLoading}
      />
      <StatCard
        label="Paid Amount"
        value={formatAmount(summary?.paidAmount ?? 0, currency)}
        color="var(--color-money-positive)"
        isLoading={isLoading}
      />
    </div>
  );
}
