import { useFinancialSummary } from '../hooks/useFinancialSummary';

function formatCurrency(value: number): string {
  return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

interface StatCardProps {
  label: string;
  value: string;
  color: string;
  isLoading: boolean;
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

export function FinancialSummaryBar() {
  const { summary, isLoading } = useFinancialSummary();

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="financial-summary-bar">
      <StatCard
        label="Total Debits"
        value={formatCurrency(summary?.totalDebits ?? 0)}
        color="var(--color-money-negative)"
        isLoading={isLoading}
      />
      <StatCard
        label="Payouts"
        value={formatCurrency(summary?.totalPayouts ?? 0)}
        color="var(--color-money-positive)"
        isLoading={isLoading}
      />
      <StatCard
        label="Adjustments"
        value={formatCurrency(summary?.totalAdjustments ?? 0)}
        color="var(--color-text-primary)"
        isLoading={isLoading}
      />
      <StatCard
        label="Refunds"
        value={formatCurrency(summary?.totalRefunds ?? 0)}
        color="var(--color-warning)"
        isLoading={isLoading}
      />
      <StatCard
        label="Pending"
        value={String(summary?.pendingCount ?? 0)}
        color="var(--color-warning)"
        isLoading={isLoading}
      />
    </div>
  );
}
