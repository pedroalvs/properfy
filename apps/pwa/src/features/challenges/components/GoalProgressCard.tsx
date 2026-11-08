import type { InspectorProgramResponse } from '@properfy/shared';
import { formatBonus, formatCivilShort, goalProgressText, goalStatusLine, hasProgressBar } from '../lib/challenge-copy';

type ActiveGoal = InspectorProgramResponse['activeGoals'][number];

/** One active goal the inspector participates in: title, bonus, description, progress and deadline. */
export function GoalProgressCard({ goal }: { goal: ActiveGoal }) {
  const showBar = hasProgressBar(goal.metric);
  const value = goal.value ?? 0;
  const pct = goal.target > 0 ? Math.max(0, Math.min(100, Math.round((value / goal.target) * 100))) : 0;

  return (
    <article className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-bold text-foreground">{goal.title}</h3>
        <span className="shrink-0 text-sm font-bold text-primary">{formatBonus(goal.rewardAmount)}</span>
      </div>
      <p className="text-sm text-muted-foreground">{goal.description}</p>
      {goal.countsSince && (
        <p className="text-xs text-muted-foreground">Counts jobs since {formatCivilShort(goal.countsSince)}</p>
      )}

      {showBar && (
        <div
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={goal.target}
          aria-valuetext={`${value} of ${goal.target} inspections`}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-foreground">{goalProgressText(goal)}</span>
        <span className="text-muted-foreground">
          {goalStatusLine({ metric: goal.metric, state: goal.state, daysLeft: goal.daysLeft, target: goal.target })}
        </span>
      </div>
    </article>
  );
}
