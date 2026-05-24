import { PageHeader } from '@/components/layout/PageHeader';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useNavigate } from 'react-router-dom';
import { useDashboardStats } from '../hooks';
import { DashboardSummaryCards, RecentAppointmentsList, PendingActionsCard, StatCard, InspectorBreakdownSection } from '../components';

function computeTomorrowLabel(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).format(tomorrow);
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { stats, isLoading } = useDashboardStats();
  const tomorrowLabel = computeTomorrowLabel();

  return (
    <div>
      <PageHeader title="Dashboard" />

      {isLoading || !stats ? (
        <LoadingState rows={8} />
      ) : (
        <>
          <DashboardSummaryCards
            {...stats.appointmentsByStatus}
            donePendingCrossCheck={stats.pendingActions.pendingOperatorCrossChecks}
          />

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
        </>
      )}
    </div>
  );
}
