import type { InspectorProgramResponse } from '@properfy/shared';
import { formatBonus, formatCivilShort } from '../lib/challenge-copy';

type ActiveGoal = InspectorProgramResponse['activeGoals'][number];

/** A goal that has not started yet but begins within 7 days (L-F08-12). No bar, no progress. */
export function UpcomingGoalCard({ goal }: { goal: ActiveGoal }) {
  return (
    <article className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-bold text-foreground">{goal.title}</h3>
        <span className="shrink-0 text-sm font-bold text-primary">{formatBonus(goal.rewardAmount)}</span>
      </div>
      <p className="text-sm text-muted-foreground">{goal.description}</p>
      <p className="text-sm font-semibold text-foreground">
        {goal.startsOn ? `Starts ${formatCivilShort(goal.startsOn)}` : 'Starting soon'}
      </p>
    </article>
  );
}
