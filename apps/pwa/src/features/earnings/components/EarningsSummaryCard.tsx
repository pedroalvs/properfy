interface EarningsSummaryCardProps {
  label: string;
  amount: string;
  subtitle?: string;
}

export function EarningsSummaryCard({ label, amount, subtitle }: EarningsSummaryCardProps) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/92 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
      <p className="text-sm font-medium text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-text-primary">{amount}</p>
      {subtitle && <p className="mt-1 text-xs text-text-muted">{subtitle}</p>}
    </div>
  );
}
