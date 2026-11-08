import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoalMetric, describeGoal, formatCurrency, type GoalResponse, type BillingPeriodType, type GoalMetric as GoalMetricT } from '@properfy/shared';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { useGoals } from '../hooks/useGoals';
import { GoalFilters, type GoalFiltersValue } from './GoalFilters';
import {
  PERIOD_CYCLE_LABELS,
  formatCivilDayWithWeekday,
  formatCivilRangeWithWeekday,
} from '../lib/goal-labels';

/** The scope name passed to `describeGoal` (null for a deleted or absent scope). */
function goalScopeLabel(goal: GoalResponse): string | null {
  if (goal.metric === GoalMetric.REGION_VOLUME) return goal.scopeRegionName;
  if (goal.metric === GoalMetric.SERVICE_TYPE_VOLUME) return goal.scopeServiceTypeName;
  return null;
}

/** The "Who" column: a named inspector, a region/service-type cohort, or everyone. */
function goalAudience(goal: GoalResponse): string {
  if (goal.scopeInspectorId) return goal.scopeInspectorName ?? 'A specific inspector';
  if (goal.metric === GoalMetric.REGION_VOLUME) {
    return `Inspectors in ${goal.scopeRegionName ?? 'a deleted region'}`;
  }
  if (goal.metric === GoalMetric.SERVICE_TYPE_VOLUME) {
    return `Inspectors doing ${goal.scopeServiceTypeName ?? 'a deleted service type'}`;
  }
  return 'All inspectors';
}

function goalRuns(goal: GoalResponse): string {
  if (goal.endsAt) return formatCivilRangeWithWeekday(goal.startsAt, goal.endsAt);
  return `From ${formatCivilDayWithWeekday(goal.startsAt)}`;
}

/**
 * Goals tab (US1): list + Status/Metric/Period filters; "New goal" and each row
 * open the form. The Goal cell carries a focusable button so the row is reachable
 * by keyboard (DataTable rows are not focusable — F07-3 pattern).
 */
export function GoalsTab() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<GoalFiltersValue>({ status: 'active', metric: '', period: '' });

  const active = filters.status === 'all' ? undefined : filters.status === 'active';
  const { goals, isLoading, isError, refetch } = useGoals({
    active,
    metric: (filters.metric || undefined) as GoalMetricT | undefined,
    period: (filters.period || undefined) as BillingPeriodType | undefined,
  });

  const openGoal = (goalId: string) => navigate(`/goals-rewards/goals/${goalId}`);

  const columns = useMemo<DataTableColumn<GoalResponse>[]>(
    () => [
      {
        key: 'title',
        label: 'Goal',
        render: (goal) => (
          <div>
            <button
              type="button"
              className="text-left font-medium text-primary hover:underline"
              aria-label={`Open goal ${goal.title}`}
              onClick={(event) => {
                event.stopPropagation();
                openGoal(goal.id);
              }}
            >
              {goal.title}
            </button>
            <p className="text-xs text-text-secondary">
              {describeGoal({ metric: goal.metric, target: goal.target, scopeLabel: goalScopeLabel(goal) })}
            </p>
          </div>
        ),
      },
      { key: 'period', label: 'Period', width: '130px', render: (goal) => PERIOD_CYCLE_LABELS[goal.period] },
      { key: 'who', label: 'Who', render: goalAudience, hideOnMobile: true },
      { key: 'bonus', label: 'Bonus', width: '110px', render: (goal) => formatCurrency(goal.rewardAmount) },
      { key: 'runs', label: 'Runs', render: goalRuns, hideOnMobile: true },
      {
        key: 'status',
        label: 'Status',
        width: '110px',
        render: (goal) => (
          <span className={goal.active ? 'font-medium text-success' : 'text-text-muted'}>
            {goal.active ? 'Active' : 'Inactive'}
          </span>
        ),
      },
    ],
    // openGoal is stable enough (navigate identity); columns only depend on nothing mutable here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <GoalFilters value={filters} onChange={setFilters} />
        <Button variant="primary" onClick={() => navigate('/goals-rewards/goals/new')}>
          New goal
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={goals}
        loading={isLoading}
        error={isError ? "Couldn't load goals." : undefined}
        onRetryError={refetch}
        onRowClick={(goal) => openGoal(goal.id)}
        keyExtractor={(goal) => goal.id}
        emptyMessage="No goals yet. Create one to start the program."
      />
    </div>
  );
}
