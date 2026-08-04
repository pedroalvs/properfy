import { useNavigate } from 'react-router-dom';
import { UserRole } from '@properfy/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { FilterSegmented } from '@/components/filters/FilterSegmented';
import { FilterDateRange } from '@/components/filters/FilterDateRange';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { useAnalytics, useAnalyticsHeatmap } from '../hooks/useAnalytics';
import { PERIOD_PRESETS, useAnalyticsPeriod, type PeriodPreset } from '../hooks/useAnalyticsPeriod';
import { AnalyticsKpiGrid } from '../components/AnalyticsKpiGrid';
import { EvolutionChart } from '../components/EvolutionChart';
import { ConfirmationMeter } from '../components/ConfirmationMeter';
import { ServiceTypeDistribution } from '../components/ServiceTypeDistribution';
import { AvgExecutionBars } from '../components/AvgExecutionBars';
import { RegionHeatmap } from '../components/RegionHeatmap';

/**
 * Analytics — the KPI, chart and heatmap layer of client scope §4.1.
 *
 * Laid out as a bento: the evolution chart is the hero at two-thirds width with
 * the standing indicators stacked beside it, three mid-size panels below, and
 * the heatmap full width at the foot.
 *
 * All four business roles pass the route guard (AM, OP, CL_ADMIN, CL_USER);
 * INSP and TNT are denied there. Within that set the scoping is per-tenant and
 * server-side — AM/OP see every agency, CL_ADMIN and CL_USER their own. Revenue
 * is the one gated figure, and the server nulls it rather than denying the
 * screen, so a CL_USER without `view_financials` still gets the other panels.
 */
export function AnalyticsPage() {
  const navigate = useNavigate();
  const { hasRole } = usePermissions();
  const period = useAnalyticsPeriod();
  const { analytics, isLoading, isError, refetch } = useAnalytics({
    startDate: period.startDate,
    endDate: period.endDate,
    enabled: period.isValid,
  });
  const { heatmap, isLoading: heatmapLoading } = useAnalyticsHeatmap({
    startDate: period.startDate,
    endDate: period.endDate,
    enabled: period.isValid,
  });

  return (
    <div>
      {/* With the sidebar entries gone these actions are the only in-cluster
          navigation. Everyone past the route guard may open the Dashboard;
          Workload mirrors its narrower AM/OP-only guard. */}
      <PageHeader
        title="Analytics"
        secondaryActions={[
          { label: 'Dashboard', icon: 'mdi-view-dashboard-outline', onClick: () => navigate('/dashboard') },
          ...(hasRole(UserRole.AM, UserRole.OP)
            ? [{ label: 'Workload', icon: 'mdi-account-clock-outline', onClick: () => navigate('/inspector-workload') }]
            : []),
        ]}
      />

      <div className="mb-5 flex flex-wrap items-end gap-4 rounded bg-card-bg p-4 shadow-sm">
        <FilterSegmented
          label="Period"
          value={period.preset}
          options={PERIOD_PRESETS.map((preset) => ({ label: preset.label, value: preset.value }))}
          onChange={(value) => period.setPreset(value as PeriodPreset)}
        />
        {period.preset === 'custom' && (
          <FilterDateRange
            label="Dates"
            startDate={period.startDate}
            endDate={period.endDate}
            onStartChange={period.setStartDate}
            onEndChange={period.setEndDate}
          />
        )}
      </div>

      {!period.isValid ? (
        <div className="rounded bg-card-bg p-8 text-center text-sm text-text-secondary shadow-sm">
          Pick a start and end date to see the numbers.
        </div>
      ) : isError ? (
        <ErrorState message="Could not load analytics for this period." onRetry={() => refetch()} />
      ) : isLoading || !analytics ? (
        <LoadingState rows={8} variant="card" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <EvolutionChart
                evolution={analytics.evolution}
                granularity={analytics.period.granularity}
              />
            </div>
            <div className="lg:col-span-1">
              <AnalyticsKpiGrid kpis={analytics.kpis} revenue={analytics.revenue} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ConfirmationMeter confirmationRate={analytics.confirmationRate} />
            <ServiceTypeDistribution distribution={analytics.serviceTypeDistribution} />
            <AvgExecutionBars avgExecutionMinutes={analytics.avgExecutionMinutes} />
          </div>

          <div className="mt-6">
            <RegionHeatmap heatmap={heatmap} isLoading={heatmapLoading} />
          </div>
        </>
      )}
    </div>
  );
}
