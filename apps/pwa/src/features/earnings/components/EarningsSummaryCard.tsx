interface EarningsSummaryCardProps {
  label: string;
  amount: string;
  subtitle?: string;
}

export function EarningsSummaryCard({ label, amount, subtitle }: EarningsSummaryCardProps) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text-primary">{amount}</p>
      {subtitle && <p className="mt-1 text-xs text-text-muted">{subtitle}</p>}
    </div>
  );
}
