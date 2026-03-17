import { PageHeader } from '@/components/layout/PageHeader';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useDashboardStats } from '../hooks';
import { DashboardSummaryCards, RecentAppointmentsList, PendingActionsCard, StatCard } from '../components';

export function DashboardPage() {
  const { stats, isLoading } = useDashboardStats();

  return (
    <div>
      <PageHeader title="Dashboard" />

      {isLoading || !stats ? (
        <LoadingState rows={8} />
      ) : (
        <>
          <DashboardSummaryCards {...stats.appointmentsByStatus} />

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <RecentAppointmentsList appointments={stats.recentAppointments} />
            </div>
            <div className="lg:col-span-2">
              <PendingActionsCard {...stats.pendingActions} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon="mdi-home-city-outline"
              value={stats.quickStats.totalProperties}
              label="Imóveis cadastrados"
              colorClass="border-l-[#21566E]"
              iconColorClass="text-secondary"
            />
            <StatCard
              icon="mdi-badge-account-outline"
              value={stats.quickStats.activeInspectors}
              label="Inspetores ativos"
              colorClass="border-l-[#21566E]"
              iconColorClass="text-secondary"
            />
            <StatCard
              icon="mdi-office-building-marker"
              value={stats.quickStats.activeServiceGroups}
              label="Grupos de serviço ativos"
              colorClass="border-l-[#21566E]"
              iconColorClass="text-secondary"
            />
          </div>
        </>
      )}
    </div>
  );
}
