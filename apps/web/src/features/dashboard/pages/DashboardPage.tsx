import { UserRole } from '@properfy/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useNavigate } from 'react-router-dom';
import { useDashboardStats } from '../hooks';
import { DashboardSummaryCards, RecentAppointmentsList, PendingActionsCard, StatCard, InspectorBreakdownSection } from '../components';
import { IntegrationWarnings } from '../components/IntegrationWarnings';
import { usePermissions } from '@/hooks/usePermissions';

function computeTomorrowLabel(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  // en-AU orders this day-then-month ('Wed, 29 Jul'); en-US would render 'Wed, Jul 29'.
  const dateStr = Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).format(tomorrow);
  return `Tomorrow — ${dateStr}`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { stats, isLoading } = useDashboardStats();
  const { hasRole } = usePermissions();
  const tomorrowLabel = computeTomorrowLabel();

  // /dashboard is unguarded and INSP lands here, but /analytics is guarded to
  // the four business roles. Offering the button to an inspector would bounce
  // them straight back with a permission toast — the Sidebar already hides the
  // equivalent entry for exactly this reason.
  const canViewAnalytics = hasRole(UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        secondaryActions={
          canViewAnalytics
            ? [{ label: 'Analytics', icon: 'mdi-chart-line', onClick: () => navigate('/analytics') }]
            : undefined
        }
      />

      <IntegrationWarnings />

      {isLoading || !stats ? (
        <LoadingState rows={8} />
      ) : (
        <>
          <DashboardSummaryCards
            {...stats.appointmentsByStatus}
            donePendingCrossCheck={stats.pendingActions.pendingOperatorCrossChecks}
          />

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon="mdi-home-city-outline"
              value={stats.quickStats.totalProperties}
              label="Registered Properties"
              colorClass="border-l-[#21566E]"
              iconColorClass="text-secondary"
              href="/properties"
            />
            <StatCard
              icon="mdi-badge-account-outline"
              value={stats.quickStats.activeInspectors}
              label="Active Inspectors"
              colorClass="border-l-[#21566E]"
              iconColorClass="text-secondary"
              href="/inspectors"
            />
            <StatCard
              icon="mdi-office-building-marker"
              value={stats.quickStats.activeServiceGroups}
              label="Active Service Groups"
              colorClass="border-l-[#21566E]"
              iconColorClass="text-secondary"
              href="/service-groups"
            />
          </div>

          {stats.inspectorBreakdowns && (
            <div className="mt-6">
              <InspectorBreakdownSection
                breakdowns={stats.inspectorBreakdowns}
                tomorrowLabel={tomorrowLabel}
              />
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <RecentAppointmentsList
                appointments={stats.recentAppointments}
                onViewAppointment={(id) => navigate(`/appointments/${id}`)}
                onViewAll={() => navigate('/appointments')}
              />
            </div>
            <div className="lg:col-span-2">
              <PendingActionsCard {...stats.pendingActions} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
