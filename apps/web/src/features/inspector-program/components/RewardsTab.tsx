import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BillingPeriodType, type RewardAwardResponse } from '@properfy/shared';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { InvoiceDetailDrawer } from '@/features/financial/components/InvoiceDetailDrawer';
import { usePermissions } from '@/hooks/usePermissions';
import { useSnackbar } from '@/hooks/useSnackbar';
import { toApiError } from '@/lib/api-error';
import { PERIOD_CYCLE_LABELS } from '../lib/goal-labels';
import { useProgramPeriods } from '../hooks/useProgramPeriods';
import { useProgramSummary } from '../hooks/useProgramSummary';
import { useRewardAwards } from '../hooks/useRewardAwards';
import { useRewardAwardAction } from '../hooks/useRewardAwardAction';
import { PeriodSelect } from './PeriodSelect';
import { ProgramTotals } from './ProgramTotals';
import { GoalSummaryTable } from './GoalSummaryTable';
import { RewardAwardsTable } from './RewardAwardsTable';
import { VoidAwardDialog, type VoidAwardPayload } from './VoidAwardDialog';

const CYCLE_OPTIONS = Object.values(BillingPeriodType).map((period) => ({
  label: PERIOD_CYCLE_LABELS[period],
  value: period,
}));

const STALE_MESSAGE = 'This reward was updated by someone else.';
const FORBIDDEN_INVOICED_VOID_MESSAGE = 'Only an Admin Master can void an invoiced reward.';
const IN_PROGRESS_MESSAGE = 'This period is still open. Rewards are created after it closes.';

function isCycle(value: string | null): value is BillingPeriodType {
  return value === 'WEEKLY' || value === 'FORTNIGHTLY' || value === 'MONTHLY';
}

/**
 * Rewards tab (US2, 03.13/03.A4): cycle + period selectors, promised × achieved
 * tiles and per-goal table, and the award list with approve/void. No manual
 * payment (Q12). Cycle/period live in the URL.
 */
export function RewardsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();
  const { approve, voidAward, pendingId } = useRewardAwardAction();
  const [voidTarget, setVoidTarget] = useState<RewardAwardResponse | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const { hasRole } = usePermissions();
  const isAdminMaster = hasRole('AM');

  const cycleParam = searchParams.get('cycle');
  const cycle: BillingPeriodType = isCycle(cycleParam) ? cycleParam : BillingPeriodType.WEEKLY;
  const periodParam = searchParams.get('period');

  // Closed periods plus the current in-progress one, shown on top.
  const past = useProgramPeriods({ periodType: cycle, direction: 'past', count: 12 });
  const current = useProgramPeriods({ periodType: cycle, direction: 'upcoming', count: 1 });
  const periodOptions = useMemo(
    () => [...current.periods, ...past.periods],
    [current.periods, past.periods],
  );

  const validPeriod = periodOptions.some((p) => p.start === periodParam)
    ? (periodParam as string)
    : (periodOptions[0]?.start ?? '');

  const setParam = (key: string, value: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );

  // Reconcile an absent/invalid period in the URL with the current period.
  useEffect(() => {
    if (!periodOptions.length) return;
    if (periodParam !== validPeriod && validPeriod) setParam('period', validPeriod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validPeriod, periodParam, periodOptions.length]);

  const selectedPeriod = validPeriod || null;
  const summary = useProgramSummary(cycle, selectedPeriod);
  const awards = useRewardAwards({ periodType: cycle, periodStart: selectedPeriod });

  const inProgress = summary.summary?.status === 'IN_PROGRESS';

  const reload = () => queryClient.invalidateQueries({ queryKey: ['inspector-program'] });

  const handleApprove = async (awardId: string) => {
    try {
      // `undefined` means the action was collapsed (another is in flight) and no
      // request was sent — never claim success for it.
      const result = await approve(awardId);
      if (result) showSuccess('Reward approved');
    } catch (err) {
      const apiError = toApiError(err);
      showError(apiError.status === 409 ? STALE_MESSAGE : apiError.message || 'Could not approve the reward.');
      if (apiError.status === 409) reload();
    }
  };

  const handleVoid = async (payload: VoidAwardPayload) => {
    if (!voidTarget) return;
    try {
      const result = await voidAward({ awardId: voidTarget.id, ...payload });
      // Only on a real void (not a collapsed call) toast and close the dialog.
      if (result) {
        showSuccess('Reward voided');
        setVoidTarget(null);
      }
    } catch (err) {
      const apiError = toApiError(err);
      showError(
        apiError.status === 409
          ? STALE_MESSAGE
          : apiError.status === 403
            ? FORBIDDEN_INVOICED_VOID_MESSAGE
            : apiError.message || 'Could not void the reward.',
      );
      setVoidTarget(null);
      if (apiError.status === 409) reload();
    }
  };

  const loading = summary.isLoading || awards.isLoading;
  const errored = summary.isError || awards.isError;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label="Cycle"
          value={cycle}
          onChange={(value) => {
            setParam('cycle', value);
            // The period from the old cycle won't exist in the new one; the effect re-anchors it.
          }}
          options={CYCLE_OPTIONS}
        />
        <div className="min-w-[220px]">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Period
          </span>
          <PeriodSelect
            periodType={cycle}
            periods={periodOptions}
            value={selectedPeriod ?? ''}
            onChange={(value) => setParam('period', value)}
            showStatus
            aria-label="Period"
          />
        </div>
      </div>

      {errored ? (
        <ErrorState message="Couldn't load this period's rewards." onRetry={reload} />
      ) : loading || !summary.summary ? (
        <LoadingState rows={6} variant="table" />
      ) : (
        <>
          <ProgramTotals totals={summary.summary.totals} />

          {inProgress && (
            <InfoBanner variant="info">{IN_PROGRESS_MESSAGE}</InfoBanner>
          )}

          <GoalSummaryTable goals={summary.summary.goals} />

          {!inProgress && (
            <RewardAwardsTable
              awards={awards.awards}
              onApprove={handleApprove}
              onVoid={setVoidTarget}
              pendingId={pendingId}
              canVoidInvoiced={isAdminMaster}
              onViewInvoice={setInvoiceId}
            />
          )}
        </>
      )}

      <VoidAwardDialog
        open={voidTarget !== null}
        inspectorName={voidTarget?.inspector.name}
        invoiced={voidTarget?.invoice != null}
        isSubmitting={pendingId === voidTarget?.id}
        onClose={() => setVoidTarget(null)}
        onConfirm={handleVoid}
      />

      <InvoiceDetailDrawer
        invoiceId={invoiceId}
        open={invoiceId !== null}
        onClose={() => setInvoiceId(null)}
        resolveInspectorLabel={(id) =>
          awards.awards.find((a) => a.inspectorId === id)?.inspector.name ?? 'Unknown inspector'
        }
      />
    </div>
  );
}
