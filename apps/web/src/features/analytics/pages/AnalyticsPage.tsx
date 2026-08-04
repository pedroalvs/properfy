import { PageHeader } from '@/components/layout/PageHeader';
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
 * Scoped the same way the dashboard is — AM/OP see every agency, CL_ADMIN and
 * CL_USER see their own — so there is no role guard on the route. Revenue is
 * the one gated figure and the server nulls it rather than denying the screen.
 */
export function AnalyticsPage() {
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
      <PageHeader title="Analytics" />

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
