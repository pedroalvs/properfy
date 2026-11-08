import { cn } from '@properfy/frontend-standards';
import { INSPECTOR_LEVEL_LABELS, type InspectorProgramResponse } from '@properfy/shared';
import { RANKING_FOOTER } from '../lib/challenge-copy';

type Ranking = InspectorProgramResponse['ranking'];

function Footer() {
  return <p className="text-xs text-muted-foreground">{RANKING_FOOTER}</p>;
}

/** The anonymous leaderboard (03.A3): own position + others' scores, never a name/id. */
export function RankingTab({ ranking }: { ranking: Ranking }) {
  const { myPosition, myScore, totalRanked, cohortTooSmall, entries } = ranking;

  if (myPosition === null) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-card border border-border bg-card p-4 shadow-sm">
          <p className="text-lg font-extrabold text-foreground">You're not ranked yet</p>
          <p className="text-sm text-muted-foreground">You'll appear once you have 10 jobs in the last 30 days.</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (cohortTooSmall) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-card border border-border bg-card p-4 shadow-sm">
          <p className="text-lg font-extrabold text-foreground">Your score: {(myScore ?? 0).toFixed(1)}</p>
          <p className="text-sm text-muted-foreground">The ranking appears once at least 5 inspectors have a score.</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg font-extrabold text-foreground">
        You're #{myPosition} of {totalRanked}
      </p>
      <ol className="flex flex-col gap-2">
        {entries.map((entry, index) => (
          <li
            key={index}
            aria-label={entry.isMe ? `Your position: ${entry.position} of ${totalRanked}, score ${entry.score.toFixed(1)}` : undefined}
            className={cn(
              'flex items-center gap-3 rounded-card border border-border bg-card px-4 py-3 text-sm shadow-sm',
              entry.isMe && 'border-primary bg-primary/5',
            )}
          >
            <span className="w-8 font-extrabold text-foreground">#{entry.position}</span>
            <span className="font-semibold text-foreground">{entry.score.toFixed(1)}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{entry.level ? INSPECTOR_LEVEL_LABELS[entry.level] : '—'}</span>
            {entry.isMe && <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">You</span>}
          </li>
        ))}
      </ol>
      <Footer />
    </div>
  );
}
