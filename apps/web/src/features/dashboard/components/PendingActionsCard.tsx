interface PendingActionsCardProps {
  noResponseTenants: number;
  pendingFinancialEntries: number;
  processingReports: number;
}

const ACTIONS = [
  { icon: 'mdi-account-question-outline', label: 'No-response tenants', key: 'noResponseTenants' },
  { icon: 'mdi-cash-clock', label: 'Pending financial entries', key: 'pendingFinancialEntries' },
  { icon: 'mdi-file-clock-outline', label: 'Reports processing', key: 'processingReports' },
] as const;

export function PendingActionsCard({
  noResponseTenants,
  pendingFinancialEntries,
  processingReports,
}: PendingActionsCardProps) {
  const counts: Record<string, number> = {
    noResponseTenants,
    pendingFinancialEntries,
    processingReports,
  };

  return (
    <div className="rounded bg-card-bg shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-base font-bold text-secondary">Pending Actions</h2>
      </div>

      <div>
        {ACTIONS.map((action) => (
          <div
            key={action.key}
            className="flex items-center gap-3 px-4 py-3"
            data-testid="pending-action-item"
          >
            <i className={`mdi ${action.icon} text-xl text-text-secondary`} />
            <span className="text-sm text-text-primary flex-1">{action.label}</span>
            <span className="rounded-full bg-real-estate/10 text-real-estate px-2 py-0.5 text-xs font-semibold">
              {counts[action.key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
