import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';

interface PendingActionsCardProps {
  noResponseRentalTenants: number;
  pendingOperatorCrossChecks: number;
  pendingFinancialEntries: number;
  processingReports: number;
}

const ACTIONS = [
  {
    icon: 'mdi-account-question-outline',
    label: 'No-response tenants',
    key: 'noResponseRentalTenants',
    href: '/appointments?rentalTenantConfirmationStatus=NO_RESPONSE',
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

const FINANCIAL_ROLES = new Set(['AM', 'OP']);

export function PendingActionsCard({
  noResponseRentalTenants,
  pendingOperatorCrossChecks,
  pendingFinancialEntries,
  processingReports,
}: PendingActionsCardProps) {
  const { user } = useAuth();
  const { hasClUserFlag } = usePermissions();
  // Reports are agency-visible, but a CL_USER without `view_financials` would be
  // sent to a page that only shows a no-permission state — hide the shortcut.
  const canViewReports = hasClUserFlag('view_financials');
  const visibleActions = ACTIONS.filter((a) => {
    if (a.key === 'pendingFinancialEntries') return FINANCIAL_ROLES.has(user?.role ?? '');
    if (a.key === 'processingReports') return canViewReports;
    return true;
  });
  const counts: Record<string, number> = {
    noResponseRentalTenants,
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
        {visibleActions.map((action) => (
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
