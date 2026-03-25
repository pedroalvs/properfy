import { Link } from 'react-router-dom';

interface PendingActionsCardProps {
  noResponseTenants: number;
  pendingOperatorCrossChecks: number;
  pendingFinancialEntries: number;
  processingReports: number;
}

const ACTIONS = [
  {
    icon: 'mdi-account-question-outline',
    label: 'No-response tenants',
    key: 'noResponseTenants',
    href: '/appointments?tenantConfirmationStatus=NO_RESPONSE',
  },
  {
    icon: 'mdi-clipboard-alert-outline',
    label: 'Pending operator cross-checks',
    key: 'pendingOperatorCrossChecks',
    href: '/appointments?status=DONE',
  },
  {
    icon: 'mdi-cash-clock',
    label: 'Pending financial entries',
    key: 'pendingFinancialEntries',
    href: '/financial?status=PENDING',
  },
  {
    icon: 'mdi-file-clock-outline',
    label: 'Reports processing',
    key: 'processingReports',
    href: '/reports?status=PROCESSING',
  },
] as const;

export function PendingActionsCard({
  noResponseTenants,
  pendingOperatorCrossChecks,
  pendingFinancialEntries,
  processingReports,
}: PendingActionsCardProps) {
  const counts: Record<string, number> = {
    noResponseTenants,
    pendingOperatorCrossChecks,
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
          <Link
            key={action.key}
            to={action.href}
            className="flex items-center gap-3 px-4 py-3 no-underline hover:bg-gray-50 transition-colors"
            data-testid="pending-action-item"
          >
            <i className={`mdi ${action.icon} text-xl text-text-secondary`} />
            <span className="text-sm text-text-primary flex-1">{action.label}</span>
            <span className="rounded-full bg-real-estate/10 text-real-estate px-2 py-0.5 text-xs font-semibold">
              {counts[action.key]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
