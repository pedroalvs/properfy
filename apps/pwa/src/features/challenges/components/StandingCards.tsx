import { INSPECTOR_LEVEL_LABELS, type BillingPeriodType, type InspectorProgramResponse } from '@properfy/shared';

type Standing = InspectorProgramResponse['standing'];

const CYCLE_NOUN: Record<BillingPeriodType, string> = { WEEKLY: 'week', FORTNIGHTLY: 'fortnight', MONTHLY: 'month' };
const CYCLE_ADJ: Record<BillingPeriodType, string> = { WEEKLY: 'weekly', FORTNIGHTLY: 'fortnightly', MONTHLY: 'monthly' };

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-card p-4 shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-2xl font-extrabold text-foreground">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** The three standing cards: reliability index, level and streak (03.15). */
export function StandingCards({ standing }: { standing: Standing }) {
  const { index, level, streak } = standing;

  const indexValue = index.score !== null ? index.score.toFixed(1) : 'Not enough data yet';
  const indexHint =
    index.status === 'NOT_COMPUTED'
      ? 'Your index will appear tomorrow.'
      : 'Based on your last 30 days. You need 10 jobs for a score.';

  let streakValue = 'No streak yet';
  let streakHint: string | undefined;
  if (streak.cycle !== null && streak.count >= 1) {
    const noun = CYCLE_NOUN[streak.cycle];
    streakValue = `${streak.count} ${noun}${streak.count === 1 ? '' : 's'} in a row`;
    if (streak.atRisk) streakHint = `Reach a ${CYCLE_ADJ[streak.cycle]} goal today to keep it.`;
  }

  return (
    <div className="flex flex-col gap-3">
      <StatCard label="Reliability index" value={indexValue} hint={indexHint} />
      <StatCard label="Level" value={level ? INSPECTOR_LEVEL_LABELS[level] : 'No level yet'} />
      <StatCard label="Streak" value={streakValue} hint={streakHint} />
    </div>
  );
}
