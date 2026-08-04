import { PageHeader } from '@/components/layout/PageHeader';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useWorkloadWeek } from '../hooks/useWorkloadWeek';
import { useInspectorWorkload } from '../hooks/useInspectorWorkload';
import { WeekSelector } from '../components/WeekSelector';
import { WorkloadAlertBanner } from '../components/WorkloadAlertBanner';
import { WorkloadKpiGrid } from '../components/WorkloadKpiGrid';
import { WeeklyComparisonPanels } from '../components/WeeklyComparisonPanels';
import { CompletedSummary } from '../components/CompletedSummary';
import { WorkloadMatrix } from '../components/WorkloadMatrix';

/**
 * Inspector Workload — one Monday-anchored week of capacity at a time.
 *
 * The week selector in the header governs the whole page: the KPIs, the
 * comparison strip and the matrix all describe the same seven days, so nothing
 * on screen is talking about a different period than anything else.
 *
 * AM and OP only. Inspectors are cross-tenant entities, so an agency-scoped view
 * would show only that agency's slice of an inspector's week and the capacity
 * thresholds would be meaningless against it. The route guard and the use case
 * both enforce that.
 */
export function InspectorWorkloadPage() {
  const week = useWorkloadWeek();
  const { workload, isLoading, isError, refetch } = useInspectorWorkload(week.weekStart);

  return (
    <div>
      <PageHeader title="Inspector Workload">
        <WeekSelector week={week} />
      </PageHeader>

      {isError ? (
        <ErrorState message="Could not load inspector workload for this week." onRetry={() => refetch()} />
      ) : isLoading || !workload ? (
        <LoadingState rows={8} variant="card" />
      ) : (
        <div className="flex flex-col gap-6">
          <WorkloadAlertBanner kpis={workload.kpis} thresholds={workload.thresholds} />

          <WorkloadKpiGrid kpis={workload.kpis} thresholds={workload.thresholds} />

          <WorkloadMatrix
            matrix={workload.matrix}
            week={workload.week}
            thresholds={workload.thresholds}
          />

          <WeeklyComparisonPanels funnel={workload.funnel} />

          <CompletedSummary completed={workload.completed} />
        </div>
      )}
    </div>
  );
}
