import { useFinancialSummary } from '../hooks/useFinancialSummary';

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

interface FinancialSummaryBarProps {
  tenantId?: string;
  enabled?: boolean;
}

export function FinancialSummaryBar({ tenantId, enabled = true }: FinancialSummaryBarProps) {
  const { summary, isLoading } = useFinancialSummary(tenantId, enabled);
  const currency = summary?.currency;
  const formatAmount = (value: number) =>
    currency ? value.toLocaleString('en-AU', { style: 'currency', currency }) : '—';

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="financial-summary-bar">
      <StatCard
        label="Approved Debits"
        value={formatAmount(summary?.totalDebits ?? 0)}
        color="var(--color-money-negative)"
        isLoading={isLoading}
      />
      <StatCard
        label="Approved Payouts"
        value={formatAmount(summary?.totalPayouts ?? 0)}
        color="var(--color-money-positive)"
        isLoading={isLoading}
      />
      <StatCard
        label="Approved Adjustments"
        value={formatAmount(summary?.totalAdjustments ?? 0)}
        color="var(--color-text-primary)"
        isLoading={isLoading}
      />
      <StatCard
        label="Approved Refunds"
        value={formatAmount(summary?.totalRefunds ?? 0)}
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
