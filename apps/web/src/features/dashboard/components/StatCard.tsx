interface StatCardProps {
  icon: string;
  value: number;
  label: string;
  colorClass: string;
  iconColorClass: string;
}

export function StatCard({ icon, value, label, colorClass, iconColorClass }: StatCardProps) {
  return (
    <div
      className={`rounded bg-card-bg shadow-sm border-l-4 ${colorClass} p-4 flex items-start gap-3`}
      data-testid="stat-card"
    >
      <i className={`mdi ${icon} text-2xl ${iconColorClass}`} />
      <div>
        <div className="text-2xl font-bold text-text-primary">{value}</div>
        <div className="text-sm text-text-secondary">{label}</div>
      </div>
    </div>
  );
}
