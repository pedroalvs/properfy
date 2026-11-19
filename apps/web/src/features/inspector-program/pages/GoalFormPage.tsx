import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  GoalMetric,
  GOAL_METRICS,
  BillingPeriodType,
  formatCurrency,
  getFieldErrors,
  type GoalResponse,
} from '@properfy/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { NumberInput } from '@/components/forms/NumberInput';
import { SelectInput, type SelectOption } from '@/components/forms/SelectInput';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useSnackbar } from '@/hooks/useSnackbar';
import { toApiError } from '@/lib/api-error';
import { InspectorSelect } from '@/features/platform-settings/components/InspectorSelect';
import { BACK_TO } from './GoalsRewardsPage';
import { useGoal } from '../hooks/useGoal';
import { useSaveGoal, type CreateGoalBody, type UpdateGoalBody } from '../hooks/useSaveGoal';
import { useGoals } from '../hooks/useGoals';
import { useProgramPeriods } from '../hooks/useProgramPeriods';
import { useGoalScopeOptions } from '../hooks/useGoalScopeOptions';
import {
  GOAL_METRIC_UI_LABELS,
  PERIOD_CYCLE_LABELS,
  metricTargetUnit,
  metricComparatorWord,
  formatCivilDayWithWeekday,
  formatPeriodOptionLabel,
} from '../lib/goal-labels';

const BONUS_FOOTER =
  "Bonuses are reviewed by the Properfy team. Once approved, they're added to the inspector's next invoice.";
const NEXT_PERIOD_NOTE = 'Changes to target and bonus apply from the next period.';
const LOCKED_FIELD_HINT = 'Create a new goal to change this.';

interface FormState {
  title: string;
  metric: GoalMetric;
  period: BillingPeriodType;
  scopeRegionId: string;
  scopeServiceTypeId: string;
  scopeInspectorId: string;
  target: string;
  rewardAmount: string;
  startsAt: string;
  endsAt: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  metric: GoalMetric.VOLUME,
  period: BillingPeriodType.WEEKLY,
  scopeRegionId: '',
  scopeServiceTypeId: '',
  scopeInspectorId: '',
  target: '',
  rewardAmount: '',
  startsAt: '',
  endsAt: '',
};

function goalToForm(goal: GoalResponse): FormState {
  return {
    title: goal.title,
    metric: goal.metric,
    period: goal.period,
    scopeRegionId: goal.scopeRegionId ?? '',
    scopeServiceTypeId: goal.scopeServiceTypeId ?? '',
    scopeInspectorId: goal.scopeInspectorId ?? '',
    target: String(goal.target),
    rewardAmount: String(goal.rewardAmount),
    startsAt: goal.startsAt,
    endsAt: goal.endsAt ?? '',
  };
}

const METRIC_OPTIONS: SelectOption[] = GOAL_METRICS.map((metric) => ({
  value: metric,
  label: GOAL_METRIC_UI_LABELS[metric],
}));
const PERIOD_OPTIONS: SelectOption[] = Object.values(BillingPeriodType).map((period) => ({
  value: period,
  label: PERIOD_CYCLE_LABELS[period],
}));

/**
 * Create / edit a goal (US1). Metric/period/scope/start are fixed after creation;
 * target/bonus edits on a started goal apply from the next period (DL2). No manual
 * payment anywhere (Q12). Back button discards unsaved changes via the PageHeader
 * override (X01/DR6).
 */
export function GoalFormPage() {
  const navigate = useNavigate();
  const { goalId } = useParams();
  const isEdit = Boolean(goalId);
  const { showSuccess } = useSnackbar();

  const { goal, isLoading: goalLoading, isNotFound } = useGoal(goalId ?? null);
  const { createGoal, updateGoal, isSaving } = useSaveGoal();
  const { regionOptions, serviceTypeOptions } = useGoalScopeOptions();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [topError, setTopError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const pendingGoBack = useRef<(() => void) | null>(null);

  // Seed the form once the goal loads (edit).
  useEffect(() => {
    if (goal) setForm(goalToForm(goal));
  }, [goal]);

  const showRegion = form.metric === GoalMetric.REGION_VOLUME;
  const showServiceType = form.metric === GoalMetric.SERVICE_TYPE_VOLUME;
  const unit = metricTargetUnit(form.metric);
  const comparatorWord = metricComparatorWord(form.metric);

  // Starts: upcoming periods (create only). Ends: a longer upcoming window, reused
  // for the reactivate resume date. The web never computes a period.
  const startsPeriods = useProgramPeriods({
    periodType: form.period,
    direction: 'upcoming',
    count: 13,
    enabled: !isEdit,
  });
  const endsPeriods = useProgramPeriods({
    periodType: form.period,
    direction: 'upcoming',
    count: 26,
    enabled: isEdit ? Boolean(goal) : true,
  });

  // Overlapping active goals of the same cycle that could include the same inspectors (DL4).
  const { goals: sameCycleGoals } = useGoals({ active: true, period: form.period });
  const overlappingCount = useMemo(() => {
    const chosen = form.scopeInspectorId || null;
    return sameCycleGoals.filter(
      (g) => g.id !== goalId && (!g.scopeInspectorId || !chosen || g.scopeInspectorId === chosen),
    ).length;
  }, [sameCycleGoals, goalId, form.scopeInspectorId]);

  // Ends options: period ends at or after the floor (minEndsAt in edit; the chosen
  // start period's end in create). Plus "No end date".
  const endOptions = useMemo<SelectOption[]>(() => {
    let floor: string | null = null;
    if (isEdit) {
      floor = goal?.minEndsAt ?? null;
    } else if (form.startsAt) {
      floor = endsPeriods.periods.find((p) => p.start === form.startsAt)?.end ?? form.startsAt;
    }
    const candidates = floor
      ? endsPeriods.periods.filter((p) => p.end >= (floor as string))
      : [];
    return [
      { value: '', label: 'No end date' },
      ...candidates.map((p) => ({ value: p.end, label: formatCivilDayWithWeekday(p.end) })),
    ];
  }, [isEdit, goal?.minEndsAt, form.startsAt, endsPeriods.periods]);

  const startOptions = useMemo<SelectOption[]>(
    () =>
      startsPeriods.periods.map((p) => ({
        value: p.start,
        label: formatPeriodOptionLabel(form.period, p.start, p.end),
      })),
    [startsPeriods.periods, form.period],
  );

  const hasStarted = Boolean(goal?.currentPeriod || goal?.lastClosedPeriod);
  const reactivateFrom =
    endsPeriods.periods.find((p) => p.status === 'UPCOMING')?.start ??
    endsPeriods.periods[endsPeriods.periods.length - 1]?.start ??
    null;

  const update = useCallback((patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setTopError(null);
    setFieldErrors({});
  }, []);

  const onMetricChange = (metric: string) =>
    update({
      metric: metric as GoalMetric,
      // Drop scope values that no longer apply to the new metric.
      scopeRegionId: metric === GoalMetric.REGION_VOLUME ? form.scopeRegionId : '',
      scopeServiceTypeId: metric === GoalMetric.SERVICE_TYPE_VOLUME ? form.scopeServiceTypeId : '',
    });

  const onPeriodChange = (period: string) =>
    update({ period: period as BillingPeriodType, startsAt: '', endsAt: '' });

  // ─── Dirty tracking ──────────────────────────────────────────────────────────
  const dirty = useMemo(() => {
    if (isEdit) {
      if (!goal) return false;
      const base = goalToForm(goal);
      return (
        form.title !== base.title ||
        form.target !== base.target ||
        form.rewardAmount !== base.rewardAmount ||
        form.endsAt !== base.endsAt
      );
    }
    return JSON.stringify(form) !== JSON.stringify(EMPTY_FORM);
  }, [form, goal, isEdit]);

  const createReady =
    form.title.trim() !== '' &&
    form.target.trim() !== '' &&
    form.rewardAmount.trim() !== '' &&
    form.startsAt !== '' &&
    (!showRegion || form.scopeRegionId !== '') &&
    (!showServiceType || form.scopeServiceTypeId !== '');

  // ─── Submit ──────────────────────────────────────────────────────────────────
  const buildCreateBody = (): CreateGoalBody => ({
    title: form.title.trim(),
    metric: form.metric,
    period: form.period,
    target: Number(form.target),
    rewardAmount: Number(form.rewardAmount),
    startsAt: form.startsAt,
    ...(showRegion ? { scopeRegionId: form.scopeRegionId } : {}),
    ...(showServiceType ? { scopeServiceTypeId: form.scopeServiceTypeId } : {}),
    ...(form.scopeInspectorId ? { scopeInspectorId: form.scopeInspectorId } : {}),
    ...(form.endsAt ? { endsAt: form.endsAt } : {}),
  });

  const buildPatch = (): UpdateGoalBody => {
    if (!goal) return {};
    const base = goalToForm(goal);
    const patch: UpdateGoalBody = {};
    if (form.title !== base.title) patch.title = form.title.trim();
    if (form.target !== base.target) patch.target = Number(form.target);
    if (form.rewardAmount !== base.rewardAmount) patch.rewardAmount = Number(form.rewardAmount);
    if (form.endsAt !== base.endsAt) patch.endsAt = form.endsAt === '' ? null : form.endsAt;
    return patch;
  };

  const handleError = (err: unknown) => {
    const fes = getFieldErrors(err);
    if (Object.keys(fes).length > 0) setFieldErrors(fes as Record<string, string>);
    else setTopError(toApiError(err).message || 'Something went wrong. Try again.');
  };

  const handleSubmit = async () => {
    setTopError(null);
    setFieldErrors({});
    try {
      if (isEdit && goalId) {
        const patch = buildPatch();
        if (Object.keys(patch).length === 0) return;
        await updateGoal({ goalId, patch });
        showSuccess('Goal updated');
      } else {
        await createGoal(buildCreateBody());
        showSuccess('Goal created');
      }
      navigate(BACK_TO);
    } catch (err) {
      handleError(err);
    }
  };

  const runActive = async (active: boolean, message: string, close: () => void) => {
    if (!goalId) return;
    setTopError(null);
    try {
      await updateGoal({ goalId, patch: { active } });
      showSuccess(message);
      close();
    } catch (err) {
      close();
      handleError(err);
    }
  };

  // ─── Back with discard ───────────────────────────────────────────────────────
  const handleBack = useCallback(
    (goBack: () => void) => {
      if (dirty) {
        pendingGoBack.current = goBack;
        setShowDiscard(true);
        return;
      }
      goBack();
    },
    [dirty],
  );

  // ─── Edge states ─────────────────────────────────────────────────────────────
  if (isEdit && goalLoading && !goal) {
    return (
      <div>
        <PageHeader title="Edit goal" backTo={BACK_TO} />
        <LoadingState rows={6} variant="card" />
      </div>
    );
  }

  if (isEdit && isNotFound) {
    return (
      <div>
        <PageHeader title="Goal" backTo={BACK_TO} />
        <InfoBanner variant="warning" className="mb-4">
          Goal not found.
        </InfoBanner>
        <Link to={BACK_TO} className="text-sm font-medium text-primary hover:underline">
          Back to goals
        </Link>
      </div>
    );
  }

  const regionDeleted = Boolean(goal?.scopeRegionDeleted);

  return (
    <div>
      <PageHeader title={isEdit ? 'Edit goal' : 'New goal'} backTo={BACK_TO} onBack={handleBack} />

      {isEdit && goal && !goal.active && (
        <span className="mb-4 inline-block rounded bg-app-bg px-2 py-0.5 text-xs font-semibold text-text-muted">
          Inactive
        </span>
      )}

      {topError && (
        <InfoBanner variant="error" className="mb-4">
          {topError}
        </InfoBanner>
      )}

      {regionDeleted && (
        <InfoBanner variant="warning" className="mb-4">
          This goal&apos;s region was deleted. It can&apos;t be reactivated.
        </InfoBanner>
      )}

      <div className="flex max-w-xl flex-col gap-4">
        <FormField label="Title" htmlFor="goal-title" error={fieldErrors.title}>
          <TextInput
            id="goal-title"
            value={form.title}
            onChange={(v) => update({ title: v })}
            maxLength={120}
            error={Boolean(fieldErrors.title)}
            aria-label="Title"
          />
        </FormField>

        <FormField label="Metric" htmlFor="goal-metric">
          <SelectInput
            id="goal-metric"
            value={form.metric}
            onChange={onMetricChange}
            options={METRIC_OPTIONS}
            disabled={isEdit}
            aria-label="Metric"
          />
          {isEdit && <p className="mt-1 text-xs text-text-muted">{LOCKED_FIELD_HINT}</p>}
        </FormField>

        <FormField label="Target" htmlFor="goal-target" error={fieldErrors.target}>
          <div className="flex items-center gap-2">
            <NumberInput
              id="goal-target"
              value={form.target}
              onChange={(v) => update({ target: v })}
              error={Boolean(fieldErrors.target)}
              aria-label="Target"
            />
            <span className="whitespace-nowrap text-sm text-text-secondary">
              {comparatorWord}
              {unit ? ` · ${unit}` : ''}
            </span>
          </div>
        </FormField>

        <FormField label="Period" htmlFor="goal-period">
          <SelectInput
            id="goal-period"
            value={form.period}
            onChange={onPeriodChange}
            options={PERIOD_OPTIONS}
            disabled={isEdit}
            aria-label="Period"
          />
          {isEdit && <p className="mt-1 text-xs text-text-muted">{LOCKED_FIELD_HINT}</p>}
        </FormField>

        {showRegion && (
          <FormField label="Region" htmlFor="goal-region" error={fieldErrors.scopeRegionId}>
            <SelectInput
              id="goal-region"
              value={form.scopeRegionId}
              onChange={(v) => update({ scopeRegionId: v })}
              options={regionOptions}
              disabled={isEdit}
              placeholder="Choose a region"
              aria-label="Region"
            />
          </FormField>
        )}

        {showServiceType && (
          <FormField label="Service type" htmlFor="goal-service-type" error={fieldErrors.scopeServiceTypeId}>
            <SelectInput
              id="goal-service-type"
              value={form.scopeServiceTypeId}
              onChange={(v) => update({ scopeServiceTypeId: v })}
              options={serviceTypeOptions}
              disabled={isEdit}
              placeholder="Choose a service type"
              aria-label="Service type"
            />
          </FormField>
        )}

        <FormField label="Inspector" htmlFor="goal-inspector" hint="Leave blank to include all eligible inspectors.">
          {isEdit ? (
            <p className="text-sm text-text-secondary">
              {goal?.scopeInspectorName ?? 'All eligible inspectors'}
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <InspectorSelect
                id="goal-inspector"
                value={form.scopeInspectorId}
                onChange={(v) => update({ scopeInspectorId: v })}
                placeholder="All eligible inspectors"
                aria-label="Inspector"
              />
              {form.scopeInspectorId && (
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => update({ scopeInspectorId: '' })}
                >
                  Use all inspectors
                </button>
              )}
            </div>
          )}
        </FormField>

        <FormField label="Bonus (AUD)" htmlFor="goal-bonus" error={fieldErrors.rewardAmount}>
          <NumberInput
            id="goal-bonus"
            value={form.rewardAmount}
            onChange={(v) => update({ rewardAmount: v })}
            error={Boolean(fieldErrors.rewardAmount)}
            aria-label="Bonus (AUD)"
          />
        </FormField>

        {isEdit && hasStarted && <p className="text-xs text-text-secondary">{NEXT_PERIOD_NOTE}</p>}
        {isEdit && goal?.pendingChange && (
          <p className="text-xs text-text-secondary">
            From {formatCivilDayWithWeekday(goal.pendingChange.effectiveFrom)}: target{' '}
            {goal.pendingChange.target}, bonus {formatCurrency(goal.pendingChange.rewardAmount)}.
          </p>
        )}

        <FormField label="Starts" htmlFor="goal-starts">
          {isEdit ? (
            <p className="text-sm text-text-secondary">
              {formatPeriodOptionLabel(form.period, form.startsAt)}
              <span className="ml-2 text-xs text-text-muted">{LOCKED_FIELD_HINT}</span>
            </p>
          ) : (
            <SelectInput
              id="goal-starts"
              value={form.startsAt}
              onChange={(v) => update({ startsAt: v, endsAt: '' })}
              options={startOptions}
              placeholder="Choose a start period"
              aria-label="Starts"
            />
          )}
        </FormField>

        <FormField label="Ends" htmlFor="goal-ends" error={fieldErrors.endsAt}>
          <SelectInput
            id="goal-ends"
            value={form.endsAt}
            onChange={(v) => update({ endsAt: v })}
            options={endOptions}
            aria-label="Ends"
          />
        </FormField>

        {goal?.resumesOn && (
          <p className="text-xs text-text-secondary">
            Counts again from {formatCivilDayWithWeekday(goal.resumesOn)}
          </p>
        )}

        {overlappingCount > 0 && (
          <InfoBanner variant="info">
            Inspectors can earn this on top of {overlappingCount} other active{' '}
            {PERIOD_CYCLE_LABELS[form.period].toLowerCase()} goals.
          </InfoBanner>
        )}

        <p className="text-xs text-text-muted">{BONUS_FOOTER}</p>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isSaving}
            disabled={isEdit ? !dirty : !createReady}
          >
            {isEdit ? 'Save' : 'Create goal'}
          </Button>
          <Button variant="outlined" onClick={() => handleBack(() => navigate(BACK_TO))}>
            Cancel
          </Button>

          {isEdit && goal?.active && (
            <Button variant="delete" className="ml-auto" onClick={() => setShowDeactivate(true)}>
              Deactivate goal
            </Button>
          )}
          {isEdit && goal && !goal.active && (
            <Button
              variant="secondary"
              className="ml-auto"
              disabled={regionDeleted}
              onClick={() => setShowReactivate(true)}
            >
              Reactivate goal
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeactivate}
        title="Deactivate this goal?"
        message="Open periods won't be evaluated and no new rewards will be created."
        confirmLabel="Deactivate"
        cancelLabel="Keep active"
        variant="warning"
        onConfirm={() => runActive(false, 'Goal deactivated', () => setShowDeactivate(false))}
        onClose={() => setShowDeactivate(false)}
      />

      <ConfirmDialog
        open={showReactivate}
        title="Reactivate this goal?"
        message={
          reactivateFrom
            ? `It counts again from ${formatCivilDayWithWeekday(reactivateFrom)}. Periods while it was inactive won't be evaluated.`
            : "Periods while it was inactive won't be evaluated."
        }
        confirmLabel="Reactivate"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => runActive(true, 'Goal reactivated', () => setShowReactivate(false))}
        onClose={() => setShowReactivate(false)}
      />

      <ConfirmDialog
        open={showDiscard}
        title="Leave without saving?"
        message="You have unsaved changes. Do you want to discard them?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="warning"
        onConfirm={() => {
          setShowDiscard(false);
          pendingGoBack.current?.();
          pendingGoBack.current = null;
        }}
        onClose={() => setShowDiscard(false)}
      />
    </div>
  );
}
