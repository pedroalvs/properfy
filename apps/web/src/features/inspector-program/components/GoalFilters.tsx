import { GOAL_METRICS, BillingPeriodType } from '@properfy/shared';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { GOAL_METRIC_UI_LABELS, PERIOD_CYCLE_LABELS } from '../lib/goal-labels';

export type GoalStatusFilter = 'active' | 'inactive' | 'all';

export interface GoalFiltersValue {
  status: GoalStatusFilter;
  metric: string;
  period: string;
}

export interface GoalFiltersProps {
  value: GoalFiltersValue;
  onChange: (value: GoalFiltersValue) => void;
}

const STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'All', value: 'all' },
];

const METRIC_OPTIONS = [
  { label: 'All metrics', value: '' },
  ...GOAL_METRICS.map((metric) => ({ label: GOAL_METRIC_UI_LABELS[metric], value: metric })),
];

const PERIOD_OPTIONS = [
  { label: 'All periods', value: '' },
  ...Object.values(BillingPeriodType).map((period) => ({ label: PERIOD_CYCLE_LABELS[period], value: period })),
];

/** Status / Metric / Period filters for the Goals tab (design-system FilterSelect). */
export function GoalFilters({ value, onChange }: GoalFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <FilterSelect
        label="Status"
        value={value.status}
        onChange={(status) => onChange({ ...value, status: status as GoalStatusFilter })}
        options={STATUS_OPTIONS}
      />
      <FilterSelect
        label="Metric"
        value={value.metric}
        onChange={(metric) => onChange({ ...value, metric })}
        options={METRIC_OPTIONS}
      />
      <FilterSelect
        label="Period"
        value={value.period}
        onChange={(period) => onChange({ ...value, period })}
        options={PERIOD_OPTIONS}
      />
    </div>
  );
}
