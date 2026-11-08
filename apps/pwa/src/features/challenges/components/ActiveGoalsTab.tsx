import type { InspectorProgramResponse } from '@properfy/shared';
import { EmptyState } from '@/components/feedback/EmptyState';
import { BONUS_FOOTER } from '../lib/challenge-copy';
import { GoalProgressCard } from './GoalProgressCard';
import { UpcomingGoalCard } from './UpcomingGoalCard';

/** The Active tab: current goals, a "Starting soon" section, and the bonus footer (03.10). */
export function ActiveGoalsTab({ program }: { program: InspectorProgramResponse }) {
  const current = program.activeGoals
    .filter((g) => g.state !== 'UPCOMING')
    .sort((a, b) => a.daysLeft - b.daysLeft || b.rewardAmount - a.rewardAmount);
  const upcoming = program.activeGoals
    .filter((g) => g.state === 'UPCOMING')
    .sort((a, b) => (a.startsOn ?? '').localeCompare(b.startsOn ?? ''));

  if (current.length === 0 && upcoming.length === 0) {
    return <EmptyState title="No active challenges right now. New ones will show up here." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {current.length > 0 && (
        <div className="flex flex-col gap-3">
          {current.map((goal) => (
            <GoalProgressCard key={goal.goalId} goal={goal} />
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-foreground">Starting soon</h2>
          {upcoming.map((goal) => (
            <UpcomingGoalCard key={goal.goalId} goal={goal} />
          ))}
        </section>
      )}

      <p className="text-xs text-muted-foreground">{BONUS_FOOTER}</p>
    </div>
  );
}
