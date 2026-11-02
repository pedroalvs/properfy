import { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { addCivilDays } from '@properfy/shared';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useUnreadNoticeCount } from '@/features/announcements/hooks/useUnreadNoticeCount';
import {
  subscribeQueue,
  getQueueSnapshot,
} from '@/features/execution/hooks/useOfflineQueue';
import { FailedSyncBanner } from '@/features/execution/components/FailedSyncBanner';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useDayPlan } from '@/features/day-plan/hooks/useDayPlan';
import { RouteWarnings } from '@/features/day-plan/components/RouteWarnings';
import { progress, nextStop, comingUp, allDone, isEmpty } from '@/features/day-plan/lib/day-plan-view';
import { useCivilToday } from '../hooks/useCivilToday';
import { TodayHeader } from '../components/TodayHeader';
import { NextInspectionCard } from '../components/NextInspectionCard';
import { ComingUpList } from '../components/ComingUpList';
import { UnreadNoticesCard } from '../components/UnreadNoticesCard';
import { TomorrowRouteCard } from '../components/TomorrowRouteCard';

export function TodayPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOnline = useIsOnline();
  const today = useCivilToday();
  const tomorrow = addCivilDays(today, 1);
  const todayQuery = useDayPlan(today);
  const tomorrowQuery = useDayPlan(tomorrow);
  const { count: unreadNotices } = useUnreadNoticeCount();
  const queue = useSyncExternalStore(subscribeQueue, getQueueSnapshot);
  const queueCount = queue.filter((action) => action.status === 'PENDING').length;

  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] || 'there';
  const plan = todayQuery.data;

  const refresh = () => {
    todayQuery.refetch();
    tomorrowQuery.refetch();
  };

  // Loading with nothing cached yet.
  if (todayQuery.state === 'LOADING' && !plan) {
    return (
      <div className="p-4" aria-busy="true" data-testid="today-loading">
        <LoadingState rows={4} />
      </div>
    );
  }

  // Offline with no cached plan, or a hard error with no cached plan.
  if (!plan) {
    if (todayQuery.isOffline) {
      return (
        <div className="p-4">
          <ErrorState
            message="You're offline. Connect to load today's route."
            onRetry={refresh}
            retryLabel="Retry"
          />
        </div>
      );
    }
    if (todayQuery.state === 'ERROR') {
      return (
        <div className="p-4">
          <ErrorState message="Couldn't load your route" onRetry={refresh} retryLabel="Retry" />
        </div>
      );
    }
    // NOT_PUBLISHED / NOT_FOUND never happen for today (empty day = stops []);
    // fall through to a skeleton defensively.
    return (
      <div className="p-4" aria-busy="true">
        <LoadingState rows={4} />
      </div>
    );
  }

  const { done, total } = progress(plan);
  const next = nextStop(plan);
  const planIsToday = plan.date === today;
  const empty = isEmpty(plan);
  const everythingDone = allDone(plan);

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="flex flex-col gap-4 p-4">
        <TodayHeader
          firstName={firstName}
          civilDate={plan.date}
          timezone={plan.timezone}
          isOnline={isOnline}
          queueCount={queueCount}
          done={done}
          total={total}
          finishEta={plan.finishEta}
          allDone={everythingDone}
        />

        {todayQuery.isOffline && (
          <p className="text-sm text-muted-foreground" data-testid="offline-note">
            Offline · showing your last saved route
          </p>
        )}

        <FailedSyncBanner />

        <RouteWarnings
          originWarning={plan.originWarning}
          approximate={plan.approximate}
          stale={todayQuery.state === 'STALE'}
        />

        {empty ? (
          <EmptyState
            title="No inspections today"
            action={{ label: 'Browse offers', onClick: () => navigate('/marketplace') }}
          />
        ) : everythingDone ? (
          <section className="rounded-card border border-border bg-card px-4 py-6 text-center">
            <p className="text-base font-semibold text-foreground">All done for today</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {total} of {total} done
            </p>
          </section>
        ) : (
          <>
            {next && <NextInspectionCard stop={next} planDate={plan.date} isToday={planIsToday} />}
            <ComingUpList stops={comingUp(plan)} total={total} />
          </>
        )}

        <UnreadNoticesCard count={unreadNotices} />

        <TomorrowRouteCard date={tomorrow} query={tomorrowQuery} />
      </div>
    </PullToRefresh>
  );
}
